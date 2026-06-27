import {
  billing,
  businesses,
  db,
  expenseCategories,
  externalCommissionEntries,
  externalParties,
  ledgerEntries
} from "@bh/db";
import { commissionEntryStatusSchema, externalCommissionSettleSchema } from "@bh/shared";
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
    status: row.status,
    ledger_entry_id: row.ledgerEntryId,
    source_line_id: row.sourceLineId,
    note: row.note,
    created_at: row.createdAt
  };
}

function totalsFromRows(rows: Array<{ status: string; total: string }>) {
  const total = rows.reduce((sum, row) => (row.status === "void" ? sum : sum + Number(row.total)), 0);
  const settled = rows
    .filter((row) => row.status === "settled")
    .reduce((sum, row) => sum + Number(row.total), 0);
  const outstanding = rows
    .filter((row) => row.status === "pending")
    .reduce((sum, row) => sum + Number(row.total), 0);

  return {
    total: total.toFixed(2),
    settled: settled.toFixed(2),
    outstanding: outstanding.toFixed(2)
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
        status: externalCommissionEntries.status,
        total: sql<string>`coalesce(sum(${externalCommissionEntries.amountSgd}),0)`
      })
      .from(externalCommissionEntries)
      .where(where)
      .groupBy(externalCommissionEntries.status);

    const byPayeeRows = await db
      .select({
        payeeId: externalCommissionEntries.payeeId,
        payeeName: externalParties.name,
        status: externalCommissionEntries.status,
        total: sql<string>`coalesce(sum(${externalCommissionEntries.amountSgd}),0)`
      })
      .from(externalCommissionEntries)
      .leftJoin(externalParties, eq(externalCommissionEntries.payeeId, externalParties.id))
      .where(where)
      .groupBy(externalCommissionEntries.payeeId, externalParties.name, externalCommissionEntries.status);

    const byPayee = new Map<string, { payee_id: string; payee_name: string | null; rows: typeof overallRows }>();
    for (const row of byPayeeRows) {
      const current = byPayee.get(row.payeeId) ?? {
        payee_id: row.payeeId,
        payee_name: row.payeeName,
        rows: []
      };
      current.rows.push({ status: row.status, total: row.total });
      byPayee.set(row.payeeId, current);
    }

    return {
      summary: totalsFromRows(overallRows),
      by_payee: Array.from(byPayee.values()).map((row) => ({
        payee_id: row.payee_id,
        payee_name: row.payee_name,
        ...totalsFromRows(row.rows)
      }))
    };
  });

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
        if (current.status === "settled") {
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

        const [ledgerEntry] = await tx
          .insert(ledgerEntries)
          .values({
            companyId: business.companyId,
            bankAccountId: body.bank_account_id ?? null,
            direction: "out",
            amount: toNumeric(current.amountSgd) ?? "0",
            currency: "SGD",
            fxRate: null,
            sgdEquivalent: toNumeric(current.amountSgd) ?? "0",
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
          .set({ status: "settled", ledgerEntryId: ledgerEntry.id })
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
