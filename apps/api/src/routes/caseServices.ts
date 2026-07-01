import {
  billing,
  billingCharges,
  caseCommissions,
  caseServices,
  cases,
  commissionEntries,
  db,
  externalCommissionEntries,
  serviceItems
} from "@bh/db";
import { caseCommissionsReplaceSchema } from "@bh/shared";
import { and, asc, eq, sql } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { z } from "zod";
import { requirePerm } from "../auth/jwt";
import { generateCommissionEntries } from "./commissionUtils";
import { refreshExternalCommissionEntries } from "./externalCommissionUtils";
import { type DbExecutor, refreshPackageDealLineAmounts } from "./financeUtils";
import { parseWithSchema, sendNotFound, toNumeric } from "./hrUtils";

const caseIdParamsSchema = z.object({
  caseId: z.string().uuid()
});

const caseServiceIdParamsSchema = z.object({
  caseId: z.string().uuid(),
  id: z.string().uuid()
});

const caseServiceCreateSchema = z.object({
  service_item_id: z.string().uuid(),
  price_sgd: z.union([z.string(), z.number()]).optional(),
  note: z.string().trim().optional()
});

type CaseServiceJoined = {
  caseService: typeof caseServices.$inferSelect;
  serviceItem: typeof serviceItems.$inferSelect;
  charge: typeof billingCharges.$inferSelect | null;
};

function serializeCaseService(row: CaseServiceJoined) {
  return {
    id: row.caseService.id,
    case_id: row.caseService.caseId,
    service_item_id: row.caseService.serviceItemId,
    name_snapshot: row.caseService.nameSnapshot,
    service: {
      id: row.serviceItem.id,
      code: row.serviceItem.code,
      name: row.serviceItem.name,
      name_en: row.serviceItem.nameEn,
      category: row.serviceItem.category,
      default_price_sgd: row.serviceItem.defaultPriceSgd,
      billable: row.serviceItem.billable
    },
    source: row.caseService.source,
    is_billable: row.caseService.isBillable,
    price_sgd: row.caseService.priceSgd,
    charge_id: row.caseService.chargeId,
    charge: row.charge
      ? {
          id: row.charge.id,
          status: row.charge.status,
          amount_expected: row.charge.amountExpected,
          amount_collected: row.charge.amountCollected
        }
      : null,
    status: row.caseService.status,
    note: row.caseService.note,
    created_at: row.caseService.createdAt
  };
}

function serializeCaseCommission(row: typeof caseCommissions.$inferSelect) {
  return {
    id: row.id,
    case_id: row.caseId,
    target: row.target,
    party_id: row.partyId,
    external_party_id: row.externalPartyId,
    basis: row.basis,
    value: row.value,
    note: row.note,
    created_at: row.createdAt
  };
}

function zeroEffectiveCommissions() {
  return {
    internal_sales: {
      amount_sgd: "0.00",
      entries: []
    },
    external_channel: {
      amount_sgd: "0.00",
      entries: []
    }
  };
}

function moneyTotal(values: string[]) {
  return values.reduce((sum, value) => sum + Number(value), 0).toFixed(2);
}

async function loadEffectiveCommissions(billingId: string | null, tx: DbExecutor = db) {
  if (!billingId) {
    return zeroEffectiveCommissions();
  }

  const [internalRows, externalRows] = await Promise.all([
    tx
      .select()
      .from(commissionEntries)
      .where(and(eq(commissionEntries.billingId, billingId), sql`${commissionEntries.status} <> 'void'`)),
    tx
      .select()
      .from(externalCommissionEntries)
      .where(and(eq(externalCommissionEntries.billingId, billingId), sql`${externalCommissionEntries.status} <> 'void'`))
  ]);

  return {
    internal_sales: {
      amount_sgd: moneyTotal(internalRows.map((entry) => entry.amountOverride ?? entry.amountSgd)),
      entries: internalRows.map((entry) => ({
        id: entry.id,
        sales_id: entry.salesId,
        billing_id: entry.billingId,
        business_id: entry.businessId,
        period: entry.period,
        recurrence: entry.recurrence,
        seq: entry.seq,
        milestone_seq: entry.milestoneSeq,
        amount_sgd: entry.amountSgd,
        amount_override: entry.amountOverride,
        effective_amount_sgd: entry.amountOverride ?? entry.amountSgd,
        status: entry.status,
        source_line_id: entry.sourceLineId,
        note: entry.note,
        created_at: entry.createdAt
      }))
    },
    external_channel: {
      amount_sgd: moneyTotal(externalRows.map((entry) => entry.amountSgd)),
      entries: externalRows.map((entry) => ({
        id: entry.id,
        payee_id: entry.payeeId,
        billing_id: entry.billingId,
        business_id: entry.businessId,
        party_id: entry.partyId,
        period: entry.period,
        recurrence: entry.recurrence,
        seq: entry.seq,
        milestone_seq: entry.milestoneSeq,
        amount_sgd: entry.amountSgd,
        amount_settled: entry.amountSettled,
        status: entry.status,
        source_line_id: entry.sourceLineId,
        note: entry.note,
        created_at: entry.createdAt
      }))
    }
  };
}

async function ensureCaseBilling(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], caseRow: typeof cases.$inferSelect) {
  if (caseRow.billingId) {
    return caseRow.billingId;
  }

  const [billingRow] = await tx
    .insert(billing)
    .values({
      refType: "ep",
      refId: caseRow.id,
      totalPriceSgd: "0",
      depositSgd: "0",
      status: "unpaid",
      schemeVersionId: null
    })
    .returning();

  if (!billingRow) {
    throw new Error("billing_create_failed");
  }

  await tx
    .update(cases)
    .set({ billingId: billingRow.id, updatedAt: new Date() })
    .where(eq(cases.id, caseRow.id));

  return billingRow.id;
}

async function loadCaseService(id: string) {
  const [row] = await db
    .select({
      caseService: caseServices,
      serviceItem: serviceItems,
      charge: billingCharges
    })
    .from(caseServices)
    .innerJoin(serviceItems, eq(caseServices.serviceItemId, serviceItems.id))
    .leftJoin(billingCharges, eq(caseServices.chargeId, billingCharges.id))
    .where(eq(caseServices.id, id))
    .limit(1);

  return row ?? null;
}

export async function registerCaseServiceRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/cases/:caseId/commissions", { preHandler: requirePerm("case.view") }, async (request, reply) => {
    const { caseId } = parseWithSchema(caseIdParamsSchema, request.params);
    const [caseRow] = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);

    if (!caseRow) {
      return sendNotFound(reply);
    }

    const rows = await db
      .select()
      .from(caseCommissions)
      .where(eq(caseCommissions.caseId, caseId))
      .orderBy(asc(caseCommissions.createdAt), asc(caseCommissions.id));
    const effectiveCommissions = await loadEffectiveCommissions(caseRow.billingId);

    return {
      commissions: rows.map(serializeCaseCommission),
      effective_commissions: effectiveCommissions
    };
  });

  app.put("/cases/:caseId/commissions", { preHandler: requirePerm("case.manage") }, async (request, reply) => {
    const { caseId } = parseWithSchema(caseIdParamsSchema, request.params);
    const body = parseWithSchema(caseCommissionsReplaceSchema, request.body);

    const result = await db.transaction(async (tx) => {
      const [caseRow] = await tx.select().from(cases).where(eq(cases.id, caseId)).limit(1);

      if (!caseRow) {
        return null;
      }

      const billingId = await ensureCaseBilling(tx, caseRow);

      await tx.delete(caseCommissions).where(eq(caseCommissions.caseId, caseId));

      const commissions =
        body.length === 0
          ? []
          : await tx
              .insert(caseCommissions)
              .values(
                body.map((commission) => ({
                  caseId,
                  target: commission.target,
                  partyId: commission.party_id,
                  externalPartyId: commission.external_party_id,
                  basis: commission.basis,
                  value: toNumeric(commission.value) ?? "0",
                  note: commission.note
                }))
              )
              .returning();

      const billingRow = await refreshPackageDealLineAmounts(billingId, tx);
      if (billingRow) {
        await generateCommissionEntries(billingRow, tx);
        await refreshExternalCommissionEntries(tx, billingRow);
      }

      return {
        commissions,
        effectiveCommissions: await loadEffectiveCommissions(billingId, tx)
      };
    });

    if (!result) {
      return sendNotFound(reply);
    }

    return {
      case_id: caseId,
      commissions: result.commissions.map(serializeCaseCommission),
      effective_commissions: result.effectiveCommissions
    };
  });

  app.get("/cases/:caseId/services", { preHandler: requirePerm("case.view") }, async (request, reply) => {
    const { caseId } = parseWithSchema(caseIdParamsSchema, request.params);
    const [caseRow] = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);

    if (!caseRow) {
      return sendNotFound(reply);
    }

    const rows = await db
      .select({
        caseService: caseServices,
        serviceItem: serviceItems,
        charge: billingCharges
      })
      .from(caseServices)
      .innerJoin(serviceItems, eq(caseServices.serviceItemId, serviceItems.id))
      .leftJoin(billingCharges, eq(caseServices.chargeId, billingCharges.id))
      .where(and(eq(caseServices.caseId, caseId), eq(caseServices.status, "active")))
      .orderBy(asc(caseServices.createdAt), asc(caseServices.id));

    return { services: rows.map(serializeCaseService) };
  });

  app.post("/cases/:caseId/services", { preHandler: requirePerm("case.manage") }, async (request, reply) => {
    const { caseId } = parseWithSchema(caseIdParamsSchema, request.params);
    const body = parseWithSchema(caseServiceCreateSchema, request.body);

    const result = await db.transaction(async (tx) => {
      const [caseRow] = await tx.select().from(cases).where(eq(cases.id, caseId)).limit(1);

      if (!caseRow) {
        return { error: "case_not_found" as const };
      }

      const [serviceItem] = await tx.select().from(serviceItems).where(eq(serviceItems.id, body.service_item_id)).limit(1);

      if (!serviceItem) {
        return { error: "service_item_not_found" as const };
      }

      const billingId = await ensureCaseBilling(tx, caseRow);
      const priceSgd = toNumeric(body.price_sgd ?? serviceItem.defaultPriceSgd) ?? "0";
      let chargeId: string | null = null;

      if (serviceItem.billable) {
        const [seqRow] = await tx
          .select({ nextSeq: sql<number>`coalesce(max(${billingCharges.seq}),0) + 1` })
          .from(billingCharges)
          .where(and(eq(billingCharges.billingId, billingId), eq(billingCharges.chargeKind, "service")));
        const [charge] = await tx
          .insert(billingCharges)
          .values({
            billingId,
            chargeKind: "service",
            seq: Number(seqRow?.nextSeq ?? 1),
            label: serviceItem.name,
            caseStepId: null,
            amountExpected: priceSgd,
            amountCollected: "0",
            status: "pending",
            currency: "SGD",
            note: body.note
          })
          .returning();

        if (!charge) {
          throw new Error("service_charge_create_failed");
        }

        chargeId = charge.id;
      }

      const [caseService] = await tx
        .insert(caseServices)
        .values({
          caseId,
          serviceItemId: serviceItem.id,
          nameSnapshot: serviceItem.name,
          source: "extra",
          isBillable: serviceItem.billable,
          priceSgd,
          chargeId,
          status: "active",
          note: body.note
        })
        .returning();

      if (!caseService) {
        throw new Error("case_service_create_failed");
      }

      return { caseServiceId: caseService.id };
    });

    if ("error" in result) {
      return result.error === "case_not_found"
        ? sendNotFound(reply)
        : reply.code(400).send({ error: result.error });
    }

    const row = await loadCaseService(result.caseServiceId);

    if (!row) {
      throw new Error("case_service_load_failed");
    }

    return reply.code(201).send({ service: serializeCaseService(row) });
  });

  app.delete("/cases/:caseId/services/:id", { preHandler: requirePerm("case.manage") }, async (request, reply) => {
    const { caseId, id } = parseWithSchema(caseServiceIdParamsSchema, request.params);

    const result = await db.transaction(async (tx) => {
      const [row] = await tx
        .select({
          caseService: caseServices,
          charge: billingCharges
        })
        .from(caseServices)
        .leftJoin(billingCharges, eq(caseServices.chargeId, billingCharges.id))
        .where(and(eq(caseServices.id, id), eq(caseServices.caseId, caseId)))
        .limit(1);

      if (!row) {
        return { error: "not_found" as const };
      }

      if (row.charge && Number(row.charge.amountCollected) > 0) {
        return { error: "charge_collected" as const };
      }

      await tx
        .update(caseServices)
        .set({ status: "removed" })
        .where(and(eq(caseServices.id, id), eq(caseServices.caseId, caseId)));

      return { ok: true as const };
    });

    if ("error" in result) {
      if (result.error === "not_found") {
        return sendNotFound(reply);
      }

      return reply.code(409).send({ error: result.error, message: "请先处理该服务已收款记录" });
    }

    return { ok: true };
  });
}
