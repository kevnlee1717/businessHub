import {
  billing,
  billingCharges,
  businesses,
  caseSteps,
  cases,
  db,
  payments,
  priceAdjustments,
  schemeLines,
  schemeMilestones,
  schemeVersions
} from "@bh/db";
import {
  billingCreateSchema,
  billingRefTypes,
  billingStatuses,
  generateCharges,
  type DealInputs,
  billingUpdateSchema,
  paymentCreateSchema
} from "@bh/shared";
import { and, asc, count, desc, eq, sql, type SQL } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { z } from "zod";
import { companyFilter, getAccessibleCompanyIds } from "../auth/context";
import { requirePerm } from "../auth/jwt";
import { getPagination, paginationQuery } from "../lib/pagination";
import { generateCommissionEntries } from "./commissionUtils";
import { refreshExternalCommissionEntries } from "./externalCommissionUtils";
import { refreshBillingDealLineAmounts, serializeDealEconomics, toEngineLines } from "./financeUtils";
import { idParamsSchema, parseWithSchema, sendNotFound, toNumeric } from "./hrUtils";
import { bridgePaymentToLedger } from "./ledgerUtils";

const billingQuerySchema = z
  .object({
    ref_type: z.enum(billingRefTypes).optional(),
    ref_id: z.string().uuid().optional(),
    status: z.enum(billingStatuses).optional()
  })
  .merge(paginationQuery);

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbExecutor = typeof db | DbTransaction;

function currentSgtPeriod(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit"
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  return `${year}-${month}`;
}

function inputStartPeriod(inputs: DealInputs): string {
  const raw = (inputs as Record<string, unknown>).start_period ?? (inputs as Record<string, unknown>).startPeriod;
  return typeof raw === "string" && /^\d{4}-\d{2}$/.test(raw) ? raw : currentSgtPeriod();
}

function inputsWithTotalPrice(
  inputs: DealInputs | Record<string, number> | null | undefined,
  totalPriceSgd: string | number | null | undefined
): DealInputs | null | undefined {
  const totalPrice = Number(totalPriceSgd);

  if (!Number.isFinite(totalPrice) || totalPrice <= 0) {
    return inputs as DealInputs | null | undefined;
  }

  return { ...(inputs ?? {}), price: totalPrice };
}

function addDaysAsDateString(base: Date, days: number): string {
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function computeCommission(
  type: "percent" | "fixed" | null | undefined,
  value: string | number | null | undefined,
  total: string | number | null | undefined
): number {
  if (!type || value === null || value === undefined) {
    return 0;
  }

  const numericValue = Number(value);
  const numericTotal = Number(total ?? 0);

  if (type === "percent") {
    return (numericTotal * numericValue) / 100;
  }

  return numericValue;
}

async function recomputeStatus(billingId: string, tx: DbExecutor = db) {
  const [row] = await tx.select().from(billing).where(eq(billing.id, billingId)).limit(1);

  if (!row) {
    return null;
  }

  const [paidRow] = await tx
    .select({
      total: sql<string>`coalesce(sum(${payments.sgdEquivalent}),0)`
    })
    .from(payments)
    .where(eq(payments.billingId, billingId));

  const paidTotal = Number(paidRow?.total ?? 0);
  const totalPrice = Number(row.totalPriceSgd);
  const status = paidTotal >= totalPrice ? "paid" : paidTotal > 0 ? "partial" : "unpaid";
  const [updated] = await tx
    .update(billing)
    .set({ status, updatedAt: new Date() })
    .where(eq(billing.id, billingId))
    .returning();

  return updated;
}

function serializeBilling(row: typeof billing.$inferSelect) {
  return {
    id: row.id,
    ref_type: row.refType,
    ref_id: row.refId,
    total_price_sgd: row.totalPriceSgd,
    deposit_sgd: row.depositSgd,
    status: row.status,
    sales_id: row.salesId,
    commission_type: row.commissionType,
    commission_value: row.commissionValue,
    commission_amount_sgd: row.commissionAmountSgd,
    business_id: row.businessId,
    scheme_version_id: row.schemeVersionId,
    inputs: row.inputs,
    external_payees: row.externalPayees,
    created_at: row.createdAt,
    updated_at: row.updatedAt
  };
}

function caseStepHasCollection(
  step: Pick<typeof caseSteps.$inferSelect, "collections">,
  collectionItemId: string
): boolean {
  return step.collections.some((item) => item.collection_item_id === collectionItemId);
}

async function refreshBillingChargesForRow(
  billingRow: typeof billing.$inferSelect,
  schemeVersionId: string,
  inputs: DealInputs,
  tx: DbExecutor = db
) {
  const lineRows = await tx
    .select()
    .from(schemeLines)
    .where(eq(schemeLines.versionId, schemeVersionId))
    .orderBy(asc(schemeLines.sortOrder), asc(schemeLines.createdAt));
  const milestoneRows = await tx
    .select()
    .from(schemeMilestones)
    .where(eq(schemeMilestones.versionId, schemeVersionId))
    .orderBy(asc(schemeMilestones.seq), asc(schemeMilestones.createdAt));
  const [caseRow] = await tx
    .select({ id: cases.id })
    .from(cases)
    .where(eq(cases.billingId, billingRow.id))
    .limit(1);
  const stepRows = caseRow
    ? await tx
        .select({ id: caseSteps.id, stepOrder: caseSteps.stepOrder, collections: caseSteps.collections })
        .from(caseSteps)
        .where(eq(caseSteps.caseId, caseRow.id))
        .orderBy(asc(caseSteps.stepOrder))
    : [];
  const stepIdByOrder = new Map(stepRows.map((step) => [step.stepOrder, step.id]));
  const milestoneBySeq = new Map(milestoneRows.map((milestone) => [milestone.seq, milestone]));
  const drafts = generateCharges(
    toEngineLines(lineRows),
    milestoneRows.map((milestone) => ({
      seq: milestone.seq,
      label: milestone.label,
      basis: milestone.basis,
      value: Number(milestone.value),
      collectionItemId: milestone.collectionItemId,
      bindStepOrder: milestone.bindStepOrder,
      dueOffsetDays: milestone.dueOffsetDays,
      note: milestone.note
    })),
    inputs,
    { startPeriod: inputStartPeriod(inputs) }
  );
  const existingRows = await tx
    .select()
    .from(billingCharges)
    .where(eq(billingCharges.billingId, billingRow.id));
  const preservedKeys = new Set(
    existingRows
      .filter((charge) => charge.status !== "pending")
      .map((charge) => `${charge.chargeKind}:${charge.seq}`)
  );
  const pendingByKey = new Map(
    existingRows
      .filter((charge) => charge.status === "pending")
      .map((charge) => [`${charge.chargeKind}:${charge.seq}`, charge])
  );

  for (const draft of drafts) {
    const key = `${draft.chargeKind}:${draft.seq}`;
    if (preservedKeys.has(key)) {
      continue;
    }

    const milestone = draft.chargeKind === "milestone" ? milestoneBySeq.get(draft.seq) : undefined;
    const dueDate =
      milestone?.dueOffsetDays === null || milestone?.dueOffsetDays === undefined
        ? draft.dueDate
        : addDaysAsDateString(billingRow.createdAt ?? new Date(), milestone.dueOffsetDays);
    const collectionItemId = draft.collectionItemId;
    const collectionMatchedStepId = collectionItemId
      ? (stepRows.find((step) => caseStepHasCollection(step, collectionItemId))?.id ?? null)
      : null;
    const values = {
      billingId: billingRow.id,
      schemeLineId: draft.schemeLineId ?? null,
      chargeKind: draft.chargeKind,
      seq: draft.seq,
      label: draft.label,
      period: draft.chargeKind === "period" ? (draft.period ?? null) : draft.period ?? null,
      dueDate,
      caseStepId:
        collectionMatchedStepId ??
        (draft.bindStepOrder === null || draft.bindStepOrder === undefined
          ? draft.caseStepId ?? null
          : stepIdByOrder.get(draft.bindStepOrder) ?? null),
      amountExpected: toNumeric(draft.amountExpected) ?? "0",
      amountCollected: "0",
      status: "pending" as const,
      currency: "SGD" as const
    };

    const existing = pendingByKey.get(key);
    if (existing) {
      await tx.update(billingCharges).set(values).where(eq(billingCharges.id, existing.id));
      pendingByKey.delete(key);
    } else {
      await tx.insert(billingCharges).values(values);
    }
  }

  for (const stale of pendingByKey.values()) {
    await tx.delete(billingCharges).where(eq(billingCharges.id, stale.id));
  }
}

export async function refreshBillingCharges(billingId: string, tx: DbExecutor = db) {
  const [billingRow] = await tx.select().from(billing).where(eq(billing.id, billingId)).limit(1);

  if (!billingRow?.schemeVersionId) {
    return;
  }

  const inputs = inputsWithTotalPrice(
    billingRow.inputs as DealInputs | null | undefined,
    billingRow.totalPriceSgd
  );

  if (!inputs) {
    return;
  }

  await refreshBillingChargesForRow(
    billingRow,
    billingRow.schemeVersionId,
    inputs,
    tx
  );
}

function serializePayment(row: typeof payments.$inferSelect) {
  return {
    id: row.id,
    billing_id: row.billingId,
    paid_currency: row.paidCurrency,
    paid_amount: row.paidAmount,
    fx_rate: row.fxRate,
    sgd_equivalent: row.sgdEquivalent,
    type: row.type,
    recorded_by: row.recordedBy,
    paid_at: row.paidAt,
    note: row.note
  };
}

function serializeAdjustment(row: typeof priceAdjustments.$inferSelect) {
  return {
    id: row.id,
    billing_id: row.billingId,
    field: row.field,
    old_value: row.oldValue,
    new_value: row.newValue,
    changed_by: row.changedBy,
    changed_at: row.changedAt
  };
}

function hasOwn(input: object, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, field);
}

function changed(
  oldValue: string | null | undefined,
  newValue: string | null | undefined
): boolean {
  return String(oldValue ?? "") !== String(newValue ?? "");
}

export async function registerBillingRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/billing", { preHandler: requirePerm("finance.view") }, async (request) => {
    const query = parseWithSchema(billingQuerySchema, request.query);
    const filters: SQL[] = [];
    const companyIds = await getAccessibleCompanyIds(request);
    const accessFilter = companyFilter(companyIds, businesses.companyId);

    if (accessFilter) {
      filters.push(accessFilter);
    }

    if (query.ref_type) {
      filters.push(eq(billing.refType, query.ref_type));
    }
    if (query.ref_id) {
      filters.push(eq(billing.refId, query.ref_id));
    }
    if (query.status) {
      filters.push(eq(billing.status, query.status));
    }

    const where = filters.length > 0 ? and(...filters) : sql`true`;
    const pagination = getPagination(query);
    const rows = pagination.paginate
      ? await db
          .select({ billing })
          .from(billing)
          .leftJoin(businesses, eq(billing.businessId, businesses.id))
          .where(where)
          .orderBy(desc(billing.createdAt))
          .limit(pagination.limit)
          .offset(pagination.offset)
      : await db
          .select({ billing })
          .from(billing)
          .leftJoin(businesses, eq(billing.businessId, businesses.id))
          .where(where)
          .orderBy(desc(billing.createdAt));

    if (!pagination.paginate) {
      return { billings: rows.map((row) => serializeBilling(row.billing)) };
    }

    const [totalRow] = await db
      .select({ total: count() })
      .from(billing)
      .leftJoin(businesses, eq(billing.businessId, businesses.id))
      .where(where);

    return {
      billings: rows.map((row) => serializeBilling(row.billing)),
      total: totalRow?.total ?? 0,
      page: pagination.page,
      page_size: pagination.pageSize
    };
  });

  app.get("/billing/:id", { preHandler: requirePerm("finance.view") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [billingRow] = await db.select().from(billing).where(eq(billing.id, id)).limit(1);

    if (!billingRow) {
      return sendNotFound(reply);
    }

    const companyIds = await getAccessibleCompanyIds(request);

    if (companyIds !== "all") {
      if (!billingRow.businessId) {
        return reply.code(403).send({ error: "forbidden" });
      }

      const [business] = await db
        .select({ companyId: businesses.companyId })
        .from(businesses)
        .where(eq(businesses.id, billingRow.businessId))
        .limit(1);

      if (!business || !companyIds.includes(business.companyId)) {
        return reply.code(403).send({ error: "forbidden" });
      }
    }

    const paymentRows = await db
      .select()
      .from(payments)
      .where(eq(payments.billingId, id))
      .orderBy(desc(payments.paidAt));
    const adjustmentRows = await db
      .select()
      .from(priceAdjustments)
      .where(eq(priceAdjustments.billingId, id))
      .orderBy(desc(priceAdjustments.changedAt));
    const [paidRow] = await db
      .select({
        total: sql<string>`coalesce(sum(${payments.sgdEquivalent}),0)`
      })
      .from(payments)
      .where(eq(payments.billingId, id));

    const paidTotal = Number(paidRow?.total ?? 0);
    const balance = Number(billingRow.totalPriceSgd) - paidTotal;

    return {
      billing: serializeBilling(billingRow),
      payments: paymentRows.map(serializePayment),
      adjustments: adjustmentRows.map(serializeAdjustment),
      paid_total: paidTotal.toFixed(2),
      balance: balance.toFixed(2)
    };
  });

  app.post("/billing", { preHandler: requirePerm("finance.edit") }, async (request, reply) => {
    const body = parseWithSchema(billingCreateSchema, request.body);
    const totalPriceSgd = toNumeric(body.total_price_sgd) ?? "0";
    const inputs = inputsWithTotalPrice(body.inputs, totalPriceSgd);
    const commissionAmountSgd = computeCommission(
      body.commission_type,
      body.commission_value,
      totalPriceSgd
    ).toFixed(2);

    const result = await db.transaction(async (tx) => {
      if (body.scheme_version_id) {
        const [version] = await tx
          .select()
          .from(schemeVersions)
          .where(eq(schemeVersions.id, body.scheme_version_id))
          .limit(1);

        if (!version) {
          return { error: "scheme_version_not_found" as const };
        }
      }

      const [billingRow] = await tx
        .insert(billing)
        .values({
          refType: body.ref_type,
          refId: body.ref_id,
          totalPriceSgd,
          depositSgd: toNumeric(body.deposit_sgd) ?? "0",
          status: "unpaid",
          salesId: body.sales_id,
          commissionType: body.commission_type,
          commissionValue: toNumeric(body.commission_value),
          commissionAmountSgd,
          businessId: body.business_id,
          schemeVersionId: body.scheme_version_id,
          inputs,
          externalPayees: body.external_payees
        })
        .returning();

      if (!billingRow) {
        throw new Error("billing_create_failed");
      }

      const economics =
        body.scheme_version_id && inputs
          ? await refreshBillingDealLineAmounts(
              billingRow.id,
              body.scheme_version_id,
              inputs,
              tx
            )
          : null;

      if (body.scheme_version_id && inputs) {
        await refreshBillingCharges(billingRow.id, tx);
      }

      await generateCommissionEntries(billingRow, tx);
      await refreshExternalCommissionEntries(tx, billingRow);

      return { billingRow, economics };
    });

    if ("error" in result) {
      return reply.code(400).send({ error: result.error });
    }

    return reply.code(201).send({
      billing: serializeBilling(result.billingRow),
      economics: result.economics ? serializeDealEconomics(result.economics).totals : undefined
    });
  });

  app.patch("/billing/:id", { preHandler: requirePerm("finance.edit") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(billingUpdateSchema, request.body);

    const result = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(billing).where(eq(billing.id, id)).limit(1);

      if (!current) {
        return null;
      }

      const totalPriceSgd = hasOwn(body, "total_price_sgd")
        ? (toNumeric(body.total_price_sgd) as string)
        : current.totalPriceSgd;
      const depositSgd = hasOwn(body, "deposit_sgd")
        ? (toNumeric(body.deposit_sgd) as string)
        : current.depositSgd;
      const commissionType = hasOwn(body, "commission_type")
        ? body.commission_type
        : current.commissionType;
      const commissionValue = hasOwn(body, "commission_value")
        ? toNumeric(body.commission_value)
        : current.commissionValue;
      const shouldRecomputeCommission =
        hasOwn(body, "total_price_sgd") ||
        hasOwn(body, "commission_type") ||
        hasOwn(body, "commission_value");
      const nextSchemeVersionId = hasOwn(body, "scheme_version_id")
        ? body.scheme_version_id
        : current.schemeVersionId;
      const nextInputs = hasOwn(body, "inputs")
        ? body.inputs
        : (current.inputs as Record<string, number> | null | undefined);
      const pricedNextInputs = inputsWithTotalPrice(nextInputs, totalPriceSgd);

      if (nextSchemeVersionId) {
        const [version] = await tx
          .select()
          .from(schemeVersions)
          .where(eq(schemeVersions.id, nextSchemeVersionId))
          .limit(1);

        if (!version) {
          return { error: "scheme_version_not_found" as const };
        }
      }

      const adjustmentCandidates = [
        {
          field: "total_price_sgd",
          oldValue: current.totalPriceSgd,
          newValue: totalPriceSgd
        },
        {
          field: "deposit_sgd",
          oldValue: current.depositSgd,
          newValue: depositSgd
        },
        {
          field: "commission_value",
          oldValue: current.commissionValue,
          newValue: commissionValue
        },
        {
          field: "commission_type",
          oldValue: current.commissionType,
          newValue: commissionType
        }
      ].filter((item) => hasOwn(body, item.field) && changed(item.oldValue, item.newValue));

      if (adjustmentCandidates.length > 0) {
        await tx.insert(priceAdjustments).values(
          adjustmentCandidates.map((item) => ({
            billingId: current.id,
            field: item.field,
            oldValue: String(item.oldValue ?? ""),
            newValue: String(item.newValue ?? ""),
            changedBy: request.user.id
          }))
        );
      }

      const [updated] = await tx
        .update(billing)
        .set({
          totalPriceSgd: hasOwn(body, "total_price_sgd") ? totalPriceSgd : undefined,
          depositSgd: hasOwn(body, "deposit_sgd") ? depositSgd : undefined,
          salesId: hasOwn(body, "sales_id") ? body.sales_id : undefined,
          commissionType: hasOwn(body, "commission_type") ? commissionType : undefined,
          commissionValue: hasOwn(body, "commission_value") ? commissionValue : undefined,
          commissionAmountSgd: shouldRecomputeCommission
            ? computeCommission(commissionType, commissionValue, totalPriceSgd).toFixed(2)
            : undefined,
          status: body.status,
          businessId: hasOwn(body, "business_id") ? body.business_id : undefined,
          schemeVersionId: hasOwn(body, "scheme_version_id") ? body.scheme_version_id : undefined,
          inputs: hasOwn(body, "inputs") || hasOwn(body, "total_price_sgd") ? pricedNextInputs : undefined,
          externalPayees: hasOwn(body, "external_payees") ? body.external_payees : undefined,
          updatedAt: new Date()
        })
        .where(eq(billing.id, id))
        .returning();

      if (!updated) {
        return null;
      }

      const economics =
        nextSchemeVersionId &&
        pricedNextInputs &&
        (hasOwn(body, "scheme_version_id") || hasOwn(body, "inputs") || hasOwn(body, "total_price_sgd"))
          ? await refreshBillingDealLineAmounts(id, nextSchemeVersionId, pricedNextInputs, tx)
          : null;

      if (
        nextSchemeVersionId &&
        pricedNextInputs &&
        (hasOwn(body, "scheme_version_id") || hasOwn(body, "inputs") || hasOwn(body, "total_price_sgd"))
      ) {
        await refreshBillingCharges(updated.id, tx);
      }

      const billingRow =
        hasOwn(body, "total_price_sgd") && !hasOwn(body, "status")
          ? (await recomputeStatus(id, tx)) ?? updated
          : updated;

      await generateCommissionEntries(billingRow, tx);
      await refreshExternalCommissionEntries(tx, billingRow);

      return { billingRow, economics };
    });

    if (!result) {
      return sendNotFound(reply);
    }

    if ("error" in result) {
      return reply.code(400).send({ error: result.error });
    }

    return {
      billing: serializeBilling(result.billingRow),
      economics: result.economics ? serializeDealEconomics(result.economics).totals : undefined
    };
  });

  app.post(
    "/billing/:id/payments",
    { preHandler: requirePerm("finance.edit") },
    async (request, reply) => {
      const { id } = parseWithSchema(idParamsSchema, request.params);
      const body = parseWithSchema(paymentCreateSchema, request.body);
      const paidAmount = Number(body.paid_amount);

      if (body.paid_currency === "RMB" && (body.fx_rate === null || body.fx_rate === undefined)) {
        return reply.code(400).send({ error: "fx_rate_required" });
      }

      const result = await db.transaction(async (tx) => {
        const [billingRow] = await tx.select().from(billing).where(eq(billing.id, id)).limit(1);

        if (!billingRow) {
          return null;
        }

        const fxRate = body.paid_currency === "SGD" ? body.fx_rate : (body.fx_rate as string | number);
        const sgdEquivalent =
          body.paid_currency === "SGD" ? paidAmount : paidAmount * Number(body.fx_rate);
        const [payment] = await tx
          .insert(payments)
          .values({
            billingId: id,
            paidCurrency: body.paid_currency,
            paidAmount: toNumeric(body.paid_amount) ?? "0",
            fxRate: toNumeric(fxRate),
            sgdEquivalent: sgdEquivalent.toFixed(2),
            type: body.type,
            recordedBy: request.user.id,
            paidAt: body.paid_at ? new Date(body.paid_at) : new Date(),
            note: body.note
          })
          .returning();

        const updatedBilling = await recomputeStatus(id, tx);
        if (payment && updatedBilling) {
          const ledgerEntry = await bridgePaymentToLedger(payment, billingRow, request.user.id, {}, tx);
          if (!ledgerEntry) {
            request.log.warn({ payment_id: payment.id }, "payment_ledger_bridge_skipped");
          }
        }

        return payment && updatedBilling ? { payment, billing: updatedBilling } : null;
      });

      if (!result) {
        return sendNotFound(reply);
      }

      return reply
        .code(201)
        .send({ payment: serializePayment(result.payment), billing: serializeBilling(result.billing) });
    }
  );

  app.get("/billing/:id/payments", { preHandler: requirePerm("finance.view") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [billingRow] = await db.select().from(billing).where(eq(billing.id, id)).limit(1);

    if (!billingRow) {
      return sendNotFound(reply);
    }

    const companyIds = await getAccessibleCompanyIds(request);

    if (companyIds !== "all") {
      if (!billingRow.businessId) {
        return reply.code(403).send({ error: "forbidden" });
      }

      const [business] = await db
        .select({ companyId: businesses.companyId })
        .from(businesses)
        .where(eq(businesses.id, billingRow.businessId))
        .limit(1);

      if (!business || !companyIds.includes(business.companyId)) {
        return reply.code(403).send({ error: "forbidden" });
      }
    }

    const rows = await db
      .select()
      .from(payments)
      .where(eq(payments.billingId, id))
      .orderBy(desc(payments.paidAt));

    return { payments: rows.map(serializePayment) };
  });

  app.delete("/payments/:id", { preHandler: requirePerm("finance.edit") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);

    const deleted = await db.transaction(async (tx) => {
      const [payment] = await tx.delete(payments).where(eq(payments.id, id)).returning();

      if (!payment) {
        return null;
      }

      await recomputeStatus(payment.billingId, tx);
      return payment;
    });

    if (!deleted) {
      return sendNotFound(reply);
    }

    return { ok: true };
  });
}
