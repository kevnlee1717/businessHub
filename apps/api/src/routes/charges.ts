import {
  billing,
  billingCharges,
  businesses,
  caseSteps,
  cases,
  db,
  payments
} from "@bh/db";
import {
  chargeCollectSchema,
  chargeCreateSchema,
  chargeStatuses,
  chargeUpdateSchema
} from "@bh/shared";
import { and, asc, desc, eq, lt, sql, type SQL } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { z } from "zod";
import { requirePerm } from "../auth/jwt";
import type { DbExecutor } from "./financeUtils";
import { idParamsSchema, parseWithSchema, sendNotFound, toNumeric } from "./hrUtils";
import { bridgePaymentToLedger, computeSgdEquivalent, serializeLedgerEntry } from "./ledgerUtils";

const chargesQuerySchema = z.object({
  company_id: z.string().uuid().optional(),
  business_id: z.string().uuid().optional(),
  status: z.enum(chargeStatuses).optional(),
  period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  overdue: z.enum(["true", "false"]).optional()
});

function todaySgtDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function chargeOrder() {
  return sql`case ${billingCharges.chargeKind} when 'milestone' then 1 when 'period' then 2 else 3 end`;
}

function paymentTypeForCharge(charge: typeof billingCharges.$inferSelect) {
  if (charge.chargeKind !== "milestone") {
    return "installment" as const;
  }

  return charge.seq === 1 ? ("deposit" as const) : ("final" as const);
}

function serializeCharge(row: typeof billingCharges.$inferSelect) {
  return {
    id: row.id,
    billing_id: row.billingId,
    scheme_line_id: row.schemeLineId,
    charge_kind: row.chargeKind,
    seq: row.seq,
    label: row.label,
    period: row.period,
    due_date: row.dueDate,
    case_step_id: row.caseStepId,
    amount_expected: row.amountExpected,
    amount_collected: row.amountCollected,
    outstanding: (Number(row.amountExpected) - Number(row.amountCollected)).toFixed(2),
    status: row.status,
    currency: row.currency,
    note: row.note,
    created_at: row.createdAt
  };
}

function serializeChargeJoined(row: {
  charge: typeof billingCharges.$inferSelect;
  step: Pick<typeof caseSteps.$inferSelect, "id" | "stepOrder" | "name" | "status"> | null;
  billing: Pick<typeof billing.$inferSelect, "id" | "businessId" | "refType" | "refId"> | null;
  business: Pick<typeof businesses.$inferSelect, "id" | "companyId" | "name" | "code"> | null;
}) {
  return {
    ...serializeCharge(row.charge),
    billing: row.billing
      ? {
          id: row.billing.id,
          business_id: row.billing.businessId,
          ref_type: row.billing.refType,
          ref_id: row.billing.refId
        }
      : null,
    business: row.business
      ? {
          id: row.business.id,
          company_id: row.business.companyId,
          name: row.business.name,
          code: row.business.code
        }
      : null,
    case_step: row.step
      ? {
          id: row.step.id,
          step_order: row.step.stepOrder,
          name: row.step.name,
          status: row.step.status
        }
      : null
  };
}

function serializePayment(row: typeof payments.$inferSelect) {
  return {
    id: row.id,
    billing_id: row.billingId,
    charge_id: row.chargeId,
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

async function recomputeBillingStatus(billingId: string, tx: DbExecutor) {
  const [billingRow] = await tx.select().from(billing).where(eq(billing.id, billingId)).limit(1);
  if (!billingRow) return null;

  const [paidRow] = await tx
    .select({ total: sql<string>`coalesce(sum(${payments.sgdEquivalent}),0)` })
    .from(payments)
    .where(eq(payments.billingId, billingId));
  const paidTotal = Number(paidRow?.total ?? 0);
  const totalPrice = Number(billingRow.totalPriceSgd);
  const status = paidTotal >= totalPrice ? "paid" : paidTotal > 0 ? "partial" : "unpaid";
  const [updated] = await tx
    .update(billing)
    .set({ status, updatedAt: new Date() })
    .where(eq(billing.id, billingId))
    .returning();
  return updated ?? null;
}

function proofMissing(value: unknown) {
  if (typeof value !== "object" || value === null) return true;
  const proofDocumentIds = (value as { proof_document_ids?: unknown }).proof_document_ids;
  return !Array.isArray(proofDocumentIds) || proofDocumentIds.length === 0;
}

export async function registerChargeRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/billing/:id/charges", { preHandler: requirePerm("finance.view") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [billingRow] = await db.select().from(billing).where(eq(billing.id, id)).limit(1);

    if (!billingRow) {
      return sendNotFound(reply);
    }

    const rows = await db
      .select({
        charge: billingCharges,
        step: {
          id: caseSteps.id,
          stepOrder: caseSteps.stepOrder,
          name: caseSteps.name,
          status: caseSteps.status
        },
        billing: {
          id: billing.id,
          businessId: billing.businessId,
          refType: billing.refType,
          refId: billing.refId
        },
        business: {
          id: businesses.id,
          companyId: businesses.companyId,
          name: businesses.name,
          code: businesses.code
        }
      })
      .from(billingCharges)
      .leftJoin(caseSteps, eq(billingCharges.caseStepId, caseSteps.id))
      .leftJoin(billing, eq(billingCharges.billingId, billing.id))
      .leftJoin(businesses, eq(billing.businessId, businesses.id))
      .where(eq(billingCharges.billingId, id))
      .orderBy(chargeOrder(), asc(billingCharges.seq), asc(billingCharges.period));

    return { charges: rows.map(serializeChargeJoined) };
  });

  app.get("/cases/:id/charges", { preHandler: requirePerm("finance.view") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [caseRow] = await db.select().from(cases).where(eq(cases.id, id)).limit(1);

    if (!caseRow || !caseRow.billingId) {
      return sendNotFound(reply);
    }

    const rows = await db
      .select({
        charge: billingCharges,
        step: {
          id: caseSteps.id,
          stepOrder: caseSteps.stepOrder,
          name: caseSteps.name,
          status: caseSteps.status
        },
        billing: {
          id: billing.id,
          businessId: billing.businessId,
          refType: billing.refType,
          refId: billing.refId
        },
        business: {
          id: businesses.id,
          companyId: businesses.companyId,
          name: businesses.name,
          code: businesses.code
        }
      })
      .from(billingCharges)
      .leftJoin(caseSteps, eq(billingCharges.caseStepId, caseSteps.id))
      .leftJoin(billing, eq(billingCharges.billingId, billing.id))
      .leftJoin(businesses, eq(billing.businessId, businesses.id))
      .where(eq(billingCharges.billingId, caseRow.billingId))
      .orderBy(chargeOrder(), asc(billingCharges.seq), asc(billingCharges.period));

    return { case_id: id, billing_id: caseRow.billingId, charges: rows.map(serializeChargeJoined) };
  });

  app.get("/charges", { preHandler: requirePerm("finance.view") }, async (request) => {
    const query = parseWithSchema(chargesQuerySchema, request.query);
    const filters: SQL[] = [];

    if (query.business_id) filters.push(eq(billing.businessId, query.business_id));
    if (query.company_id) filters.push(eq(businesses.companyId, query.company_id));
    if (query.status) filters.push(eq(billingCharges.status, query.status));
    if (query.period) filters.push(eq(billingCharges.period, query.period));
    if (query.overdue === "true") {
      filters.push(lt(billingCharges.dueDate, todaySgtDate()));
      filters.push(sql`${billingCharges.status} != 'paid'`);
    }

    const rows = await db
      .select({
        charge: billingCharges,
        step: {
          id: caseSteps.id,
          stepOrder: caseSteps.stepOrder,
          name: caseSteps.name,
          status: caseSteps.status
        },
        billing: {
          id: billing.id,
          businessId: billing.businessId,
          refType: billing.refType,
          refId: billing.refId
        },
        business: {
          id: businesses.id,
          companyId: businesses.companyId,
          name: businesses.name,
          code: businesses.code
        }
      })
      .from(billingCharges)
      .leftJoin(caseSteps, eq(billingCharges.caseStepId, caseSteps.id))
      .leftJoin(billing, eq(billingCharges.billingId, billing.id))
      .leftJoin(businesses, eq(billing.businessId, businesses.id))
      .where(filters.length > 0 ? and(...filters) : sql`true`)
      .orderBy(desc(billingCharges.dueDate), chargeOrder(), asc(billingCharges.seq));

    const totals = rows.reduce(
      (acc, row) => {
        acc.expected += Number(row.charge.amountExpected);
        acc.collected += Number(row.charge.amountCollected);
        return acc;
      },
      { expected: 0, collected: 0 }
    );

    return {
      rows: rows.map(serializeChargeJoined),
      totals: {
        expected: totals.expected.toFixed(2),
        collected: totals.collected.toFixed(2),
        outstanding: (totals.expected - totals.collected).toFixed(2)
      }
    };
  });

  app.post("/charges", { preHandler: requirePerm("finance.edit") }, async (request, reply) => {
    const body = parseWithSchema(chargeCreateSchema, request.body);
    const [billingRow] = await db.select().from(billing).where(eq(billing.id, body.billing_id)).limit(1);

    if (!billingRow) {
      return sendNotFound(reply);
    }

    const chargeKind = body.charge_kind ?? "event";
    const [seqRow] = await db
      .select({ nextSeq: sql<number>`coalesce(max(${billingCharges.seq}),0) + 1` })
      .from(billingCharges)
      .where(and(eq(billingCharges.billingId, body.billing_id), eq(billingCharges.chargeKind, chargeKind)));
    const [charge] = await db
      .insert(billingCharges)
      .values({
        billingId: body.billing_id,
        chargeKind,
        seq: Number(seqRow?.nextSeq ?? 1),
        label: body.label,
        period: body.period,
        dueDate: body.due_date,
        caseStepId: body.case_step_id,
        amountExpected: toNumeric(body.amount_expected) ?? "0",
        amountCollected: "0",
        status: "pending",
        currency: body.currency ?? "SGD"
      })
      .returning();

    if (!charge) {
      throw new Error("charge_create_failed");
    }

    return reply.code(201).send({ charge: serializeCharge(charge) });
  });

  app.patch("/charges/:id", { preHandler: requirePerm("finance.edit") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(chargeUpdateSchema, request.body);
    const [current] = await db.select().from(billingCharges).where(eq(billingCharges.id, id)).limit(1);

    if (!current) {
      return sendNotFound(reply);
    }
    if (body.amount_expected !== undefined && current.status !== "pending") {
      return reply.code(422).send({ error: "amount_locked" });
    }
    if (body.status !== undefined && body.status !== "waived") {
      return reply.code(422).send({ error: "status_not_allowed" });
    }
    if (body.status === "waived" && current.status === "paid") {
      return reply.code(422).send({ error: "paid_locked" });
    }

    const [charge] = await db
      .update(billingCharges)
      .set({
        label: body.label,
        dueDate: body.due_date,
        amountExpected:
          body.amount_expected === undefined ? undefined : toNumeric(body.amount_expected) ?? "0",
        caseStepId: body.case_step_id,
        status: body.status,
        note: body.note
      })
      .where(eq(billingCharges.id, id))
      .returning();

    if (!charge) {
      return sendNotFound(reply);
    }

    return { charge: serializeCharge(charge) };
  });

  app.delete("/charges/:id", { preHandler: requirePerm("finance.edit") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [current] = await db.select().from(billingCharges).where(eq(billingCharges.id, id)).limit(1);

    if (!current) {
      return sendNotFound(reply);
    }
    if (current.status !== "pending") {
      return reply.code(422).send({ error: "delete_locked" });
    }

    await db.delete(billingCharges).where(eq(billingCharges.id, id));
    return { ok: true };
  });

  app.post("/charges/:id/collect", { preHandler: requirePerm("finance.edit") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);

    if (proofMissing(request.body)) {
      return reply.code(422).send({ error: "proof_required" });
    }

    const body = parseWithSchema(chargeCollectSchema, request.body);
    const sgd = computeSgdEquivalent(body.paid_amount, body.currency, body.fx_rate);
    if (!sgd) {
      return reply.code(422).send({ error: "fx_rate_required" });
    }

    const result = await db.transaction(async (tx) => {
      const [charge] = await tx.select().from(billingCharges).where(eq(billingCharges.id, id)).limit(1);

      if (!charge) {
        return null;
      }
      if (charge.status === "paid" || charge.status === "waived") {
        return { error: "charge_closed" as const };
      }

      const [billingRow] = await tx.select().from(billing).where(eq(billing.id, charge.billingId)).limit(1);
      if (!billingRow) {
        return null;
      }

      const [payment] = await tx
        .insert(payments)
        .values({
          billingId: charge.billingId,
          chargeId: charge.id,
          paidCurrency: body.currency,
          paidAmount: toNumeric(body.paid_amount) ?? "0",
          fxRate: sgd.fxRate,
          sgdEquivalent: sgd.sgdEquivalent,
          type: paymentTypeForCharge(charge),
          recordedBy: request.user.id,
          paidAt: new Date(body.paid_at),
          note: body.note
        })
        .returning();

      if (!payment) {
        throw new Error("payment_create_failed");
      }

      const nextCollected = Number(charge.amountCollected) + Number(sgd.sgdEquivalent);
      const nextStatus =
        nextCollected >= Number(charge.amountExpected) ? "paid" : nextCollected > 0 ? "partial" : "pending";
      const [updatedCharge] = await tx
        .update(billingCharges)
        .set({
          amountCollected: nextCollected.toFixed(2),
          status: nextStatus
        })
        .where(eq(billingCharges.id, charge.id))
        .returning();

      if (!updatedCharge) {
        throw new Error("charge_update_failed");
      }

      await recomputeBillingStatus(charge.billingId, tx);
      const ledgerOptions: { proofDocumentIds: string[]; bankAccountId?: string | null } = {
        proofDocumentIds: body.proof_document_ids
      };
      if (body.bank_account_id !== undefined) {
        ledgerOptions.bankAccountId = body.bank_account_id;
      }
      const ledgerEntry = await bridgePaymentToLedger(payment, billingRow, request.user.id, ledgerOptions, tx);

      return { charge: updatedCharge, payment, ledgerEntry };
    });

    if (!result) {
      return sendNotFound(reply);
    }
    if ("error" in result) {
      return reply.code(422).send({ error: result.error });
    }

    return reply.code(201).send({
      charge: serializeCharge(result.charge),
      payment: serializePayment(result.payment),
      ledger_entry: result.ledgerEntry ? serializeLedgerEntry(result.ledgerEntry) : null
    });
  });
}
