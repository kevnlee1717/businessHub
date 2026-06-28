import { companyExpenseCreateSchema, companyExpenseTypes, companyExpenseUpdateSchema } from "@bh/shared";
import { db, companyExpenses } from "@bh/db";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { z } from "zod";
import { companyFilter, getAccessibleCompanyIds } from "../auth/context";
import { requirePerm } from "../auth/jwt";
import { idParamsSchema, parseWithSchema, sendNotFound, toNumeric } from "./hrUtils";
import { bridgeCompanyExpenseToLedger } from "./ledgerUtils";

const expenseQuerySchema = z.object({
  company_id: z.string().uuid().optional(),
  period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  type: z.enum(companyExpenseTypes).optional()
});

function serializeExpense(row: typeof companyExpenses.$inferSelect) {
  return {
    id: row.id,
    company_id: row.companyId,
    type: row.type,
    amount: row.amount,
    currency: row.currency,
    period: row.period,
    paid_at: row.paidAt,
    note: row.note,
    document_id: row.documentId,
    created_at: row.createdAt
  };
}

export async function registerCompanyExpenseRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/company-expenses", { preHandler: requirePerm("finance.view") }, async (request) => {
    const query = parseWithSchema(expenseQuerySchema, request.query);
    const filters: SQL[] = [];
    const companyIds = await getAccessibleCompanyIds(request);
    const accessFilter = companyFilter(companyIds, companyExpenses.companyId);

    if (accessFilter) {
      filters.push(accessFilter);
    }

    if (query.company_id) {
      filters.push(eq(companyExpenses.companyId, query.company_id));
    }
    if (query.period) {
      filters.push(eq(companyExpenses.period, query.period));
    }
    if (query.type) {
      filters.push(eq(companyExpenses.type, query.type));
    }

    const rows = await db
      .select()
      .from(companyExpenses)
      .where(filters.length > 0 ? and(...filters) : sql`true`)
      .orderBy(desc(companyExpenses.createdAt));

    return { expenses: rows.map(serializeExpense) };
  });

  app.post("/company-expenses", { preHandler: requirePerm("finance.edit") }, async (request, reply) => {
    const body = parseWithSchema(companyExpenseCreateSchema, request.body);
    const expense = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(companyExpenses)
        .values({
          companyId: body.company_id,
          type: body.type,
          amount: toNumeric(body.amount) ?? "0",
          currency: body.currency,
          period: body.period,
          paidAt: body.paid_at ? new Date(body.paid_at) : undefined,
          note: body.note,
          documentId: body.document_id
        })
        .returning();

      if (created) {
        const ledgerEntry = await bridgeCompanyExpenseToLedger(created, request.user.id, tx);
        if (!ledgerEntry) {
          request.log.warn({ company_expense_id: created.id }, "company_expense_ledger_bridge_skipped");
        }
      }

      return created ?? null;
    });

    if (!expense) {
      throw new Error("company_expense_create_failed");
    }

    return reply.code(201).send({ expense: serializeExpense(expense) });
  });

  app.patch("/company-expenses/:id", { preHandler: requirePerm("finance.edit") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(companyExpenseUpdateSchema, request.body);
    const amount = body.amount === undefined ? undefined : (toNumeric(body.amount) as string);
    const expense = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(companyExpenses)
        .set({
          companyId: body.company_id,
          type: body.type,
          amount,
          currency: body.currency,
          period: body.period,
          paidAt: body.paid_at ? new Date(body.paid_at) : undefined,
          note: body.note,
          documentId: body.document_id
        })
        .where(eq(companyExpenses.id, id))
        .returning();

      if (updated) {
        const ledgerEntry = await bridgeCompanyExpenseToLedger(updated, request.user.id, tx);
        if (!ledgerEntry) {
          request.log.warn({ company_expense_id: updated.id }, "company_expense_ledger_bridge_skipped");
        }
      }

      return updated ?? null;
    });

    if (!expense) {
      return sendNotFound(reply);
    }

    return { expense: serializeExpense(expense) };
  });

  app.delete("/company-expenses/:id", { preHandler: requirePerm("finance.edit") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [expense] = await db.delete(companyExpenses).where(eq(companyExpenses.id, id)).returning();

    if (!expense) {
      return sendNotFound(reply);
    }

    return { ok: true };
  });

  app.get("/companies/:id/expenses/summary", { preHandler: requirePerm("finance.view") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const companyIds = await getAccessibleCompanyIds(request);

    if (companyIds !== "all" && !companyIds.includes(id)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const [totalRow] = await db
      .select({
        total: sql<string>`coalesce(sum(${companyExpenses.amount}),0)`
      })
      .from(companyExpenses)
      .where(eq(companyExpenses.companyId, id));

    const byPeriodRows = await db
      .select({
        period: companyExpenses.period,
        total: sql<string>`coalesce(sum(${companyExpenses.amount}),0)`
      })
      .from(companyExpenses)
      .where(eq(companyExpenses.companyId, id))
      .groupBy(companyExpenses.period)
      .orderBy(companyExpenses.period);

    const byTypeRows = await db
      .select({
        type: companyExpenses.type,
        total: sql<string>`coalesce(sum(${companyExpenses.amount}),0)`
      })
      .from(companyExpenses)
      .where(eq(companyExpenses.companyId, id))
      .groupBy(companyExpenses.type)
      .orderBy(companyExpenses.type);

    return {
      total: totalRow?.total ?? "0",
      by_period: byPeriodRows.map((row) => ({ period: row.period, total: row.total })),
      by_type: byTypeRows.map((row) => ({ type: row.type, total: row.total }))
    };
  });
}
