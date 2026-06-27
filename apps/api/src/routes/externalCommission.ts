import {
  billing,
  businesses,
  db,
  expenseCategories,
  externalCommissionEntries,
  externalParties,
  ledgerEntries
} from "@bh/db";
import {
  commissionEntryStatusSchema,
  externalCommissionSettleSchema,
  externalCommissionUpdateSchema
} from "@bh/shared";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { z } from "zod";
import { requirePerm } from "../auth/jwt";
import { refreshExternalCommissionEntries } from "./externalCommissionUtils";
import { idParamsSchema, parseWithSchema, sendNotFound, toNumeric } from "./hrUtils";
import { serializeLedgerEntry } from "./ledgerUtils";

const externalCommissionEntriesQuerySchema = z.object({
  payee_id: z.string().uuid().optional(),
  business_id: z.string().uuid().optional(),
  status: commissionEntryStatusSchema.optional()
});

const externalCommissionSummaryQuerySchema = z.object({
  payee_id: z.string().uuid().optional()
});

const recomputeSchema = z.object({
  billing_id: z.string().uuid().optional()
});

function serializeExternalCommissionEntry(row: typeof externalCommissionEntries.$inferSelect) {
  const amountSgd = Number(row.amountSgd);
  const amountSettled = Number(row.amountSettled);
  return {
    id: row.id,
    payee_id: row.payeeId,
    billing_id: row.billingId,
    business_id: row.businessId,
    party_id: row.partyId,
    period: row.period,
    recurrence: row.recurrence,
    seq: row.seq,
    amount_sgd: row.amountSgd,
    amount_settled: row.amountSettled,
    outstanding: (amountSgd - amountSettled).toFixed(2),
    status: row.status,
    ledger_entry_id: row.ledgerEntryId,
    source_line_id: row.sourceLineId,
    note: row.note,
    created_at: row.createdAt
  };
}

function totalsFromRow(row: { total: string; settled: string; outstanding: string } | undefined) {
  return {
    total: Number(row?.total ?? 0).toFixed(2),
    settled: Number(row?.settled ?? 0).toFixed(2),
    outstanding: Number(row?.outstanding ?? 0).toFixed(2)
  };
}

export async function registerExternalCommissionRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/external-commission/entries", { preHandler: requirePerm("finance.view") }, async (request) => {
    const query = parseWithSchema(externalCommissionEntriesQuerySchema, request.query);
    const filters: SQL[] = [];

    if (query.payee_id) filters.push(eq(externalCommissionEntries.payeeId, query.payee_id));
    if (query.business_id) filters.push(eq(externalCommissionEntries.businessId, query.business_id));
    if (query.status) filters.push(eq(externalCommissionEntries.status, query.status));

    const rows = await db
      .select({
        entry: externalCommissionEntries,
        payee: {
          id: externalParties.id,
          name: externalParties.name,
          nameEn: externalParties.nameEn
        },
        business: {
          id: businesses.id,
          code: businesses.code,
          name: businesses.name,
          nameEn: businesses.nameEn
        }
      })
      .from(externalCommissionEntries)
      .leftJoin(externalParties, eq(externalCommissionEntries.payeeId, externalParties.id))
      .leftJoin(businesses, eq(externalCommissionEntries.businessId, businesses.id))
      .where(filters.length > 0 ? and(...filters) : sql`true`)
      .orderBy(desc(externalCommissionEntries.period), desc(externalCommissionEntries.createdAt));

    return {
      entries: rows.map((row) => ({
        ...serializeExternalCommissionEntry(row.entry),
        payee: row.payee,
        business: row.business
      }))
    };
  });

  app.get("/external-commission/summary", { preHandler: requirePerm("finance.view") }, async (request) => {
    const query = parseWithSchema(externalCommissionSummaryQuerySchema, request.query);
    const filters = query.payee_id ? [eq(externalCommissionEntries.payeeId, query.payee_id)] : [];
    const where = filters.length > 0 ? and(...filters) : sql`true`;

    const overallRows = await db
      .select({
        total: sql<string>`coalesce(sum(${externalCommissionEntries.amountSgd}) filter (where ${externalCommissionEntries.status} <> 'void'),0)`,
        settled: sql<string>`coalesce(sum(${externalCommissionEntries.amountSettled}) filter (where ${externalCommissionEntries.status} <> 'void'),0)`,
        outstanding: sql<string>`coalesce(sum(${externalCommissionEntries.amountSgd} - ${externalCommissionEntries.amountSettled}) filter (where ${externalCommissionEntries.status} <> 'void'),0)`
      })
      .from(externalCommissionEntries)
      .where(where);

    const byPayeeRows = await db
      .select({
        payeeId: externalCommissionEntries.payeeId,
        payeeName: externalParties.name,
        total: sql<string>`coalesce(sum(${externalCommissionEntries.amountSgd}) filter (where ${externalCommissionEntries.status} <> 'void'),0)`,
        settled: sql<string>`coalesce(sum(${externalCommissionEntries.amountSettled}) filter (where ${externalCommissionEntries.status} <> 'void'),0)`,
        outstanding: sql<string>`coalesce(sum(${externalCommissionEntries.amountSgd} - ${externalCommissionEntries.amountSettled}) filter (where ${externalCommissionEntries.status} <> 'void'),0)`
      })
      .from(externalCommissionEntries)
      .leftJoin(externalParties, eq(externalCommissionEntries.payeeId, externalParties.id))
      .where(where)
      .groupBy(externalCommissionEntries.payeeId, externalParties.name);

    return {
      summary: totalsFromRow(overallRows[0]),
      by_payee: byPayeeRows.map((row) => ({
        payee_id: row.payeeId,
        payee_name: row.payeeName,
        ...totalsFromRow(row)
      }))
    };
  });

  app.patch(
    "/external-commission/:id",
    { preHandler: requirePerm("finance.manage") },
    async (request, reply) => {
      const { id } = parseWithSchema(idParamsSchema, request.params);
      const body = parseWithSchema(externalCommissionUpdateSchema, request.body);

      const [current] = await db
        .select()
        .from(externalCommissionEntries)
        .where(eq(externalCommissionEntries.id, id))
        .limit(1);

      if (!current) {
        return sendNotFound(reply);
      }

      const nextAmountSgd = body.amount_sgd === undefined ? current.amountSgd : toNumeric(body.amount_sgd) ?? "0";
      const nextStatus = Number(current.amountSettled) >= Number(nextAmountSgd) ? "settled" : "pending";
      const [entry] = await db
        .update(externalCommissionEntries)
        .set({
          amountSgd: body.amount_sgd === undefined ? undefined : nextAmountSgd,
          note: body.note,
          status: current.status === "void" ? "void" : nextStatus
        })
        .where(eq(externalCommissionEntries.id, id))
        .returning();

      if (!entry) {
        return sendNotFound(reply);
      }

      return { entry: serializeExternalCommissionEntry(entry) };
    }
  );

  app.post(
    "/external-commission/recompute",
    { preHandler: requirePerm("finance.manage") },
    async (request, reply) => {
      const body = parseWithSchema(recomputeSchema, request.body ?? {});
      const rows = body.billing_id
        ? await db.select().from(billing).where(eq(billing.id, body.billing_id)).limit(1)
        : await db.select().from(billing);

      if (body.billing_id && rows.length === 0) {
        return sendNotFound(reply);
      }

      const results = await db.transaction(async (tx) => {
        const generated = [];
        for (const row of rows) {
          generated.push({
            billing_id: row.id,
            ...(await refreshExternalCommissionEntries(tx, row))
          });
        }
        return generated;
      });

      return { recomputed: results.length, results };
    }
  );

  app.post(
    "/external-commission/:id/settle",
    { preHandler: requirePerm("finance.manage") },
    async (request, reply) => {
      const { id } = parseWithSchema(idParamsSchema, request.params);
      const proofDocumentIds =
        typeof request.body === "object" && request.body !== null
          ? (request.body as { proof_document_ids?: unknown }).proof_document_ids
          : undefined;
      if (!Array.isArray(proofDocumentIds) || proofDocumentIds.length === 0) {
        return reply.code(422).send({ error: "proof_required" });
      }

      const body = parseWithSchema(externalCommissionSettleSchema, request.body);
      const result = await db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(externalCommissionEntries)
          .where(eq(externalCommissionEntries.id, id))
          .limit(1);

        if (!current) {
          return { error: "not_found" as const };
        }
        const currentAmountSgd = Number(current.amountSgd);
        const currentAmountSettled = Number(current.amountSettled);
        if (currentAmountSettled >= currentAmountSgd) {
          return { error: "already_settled" as const };
        }
        if (!current.businessId) {
          return { error: "business_required" as const };
        }

        const [business] = await tx
          .select({ companyId: businesses.companyId })
          .from(businesses)
          .where(eq(businesses.id, current.businessId))
          .limit(1);
        const [category] = await tx
          .select({ id: expenseCategories.id })
          .from(expenseCategories)
          .where(eq(expenseCategories.code, "commission_payout"))
          .limit(1);

        if (!business) {
          return { error: "business_required" as const };
        }
        if (!category) {
          return { error: "category_required" as const };
        }

        const remaining = currentAmountSgd - currentAmountSettled;
        const thisAmount = body.amount === undefined ? remaining : Number(body.amount);
        if (!(thisAmount > 0)) {
          return { error: "amount_required" as const };
        }
        const thisAmountNumeric = toNumeric(thisAmount.toFixed(2)) ?? "0";
        const nextAmountSettled = currentAmountSettled + thisAmount;

        const [ledgerEntry] = await tx
          .insert(ledgerEntries)
          .values({
            companyId: business.companyId,
            bankAccountId: body.bank_account_id ?? null,
            direction: "out",
            amount: thisAmountNumeric,
            currency: "SGD",
            fxRate: null,
            sgdEquivalent: thisAmountNumeric,
            occurredAt: body.occurred_at ? new Date(body.occurred_at) : new Date(),
            businessId: current.businessId,
            billingId: current.billingId,
            expenseCategoryId: category.id,
            proofDocumentIds: body.proof_document_ids,
            sourceType: "manual",
            sourceId: current.id,
            note: body.note,
            recordedBy: request.user.id
          })
          .returning();

        if (!ledgerEntry) {
          throw new Error("external_commission_ledger_create_failed");
        }

        const [entry] = await tx
          .update(externalCommissionEntries)
          .set({
            amountSettled: sql`${externalCommissionEntries.amountSettled} + ${thisAmountNumeric}`,
            status: nextAmountSettled >= currentAmountSgd ? "settled" : "pending",
            ledgerEntryId: ledgerEntry.id
          })
          .where(eq(externalCommissionEntries.id, current.id))
          .returning();

        if (!entry) {
          throw new Error("external_commission_settle_failed");
        }

        return { entry, ledgerEntry };
      });

      if (result.error === "not_found") {
        return sendNotFound(reply);
      }
      if (result.error === "already_settled") {
        return reply.code(409).send({ error: "already_settled" });
      }
      if (result.error) {
        return reply.code(422).send({ error: result.error });
      }

      return {
        entry: serializeExternalCommissionEntry(result.entry),
        ledger_entry: serializeLedgerEntry(result.ledgerEntry)
      };
    }
  );
}
