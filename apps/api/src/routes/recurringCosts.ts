import { db, recurringCosts } from "@bh/db";
import { recurringCostCreateSchema, recurringCostUpdateSchema } from "@bh/shared";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { z } from "zod";
import { requirePerm } from "../auth/jwt";
import { idParamsSchema, parseWithSchema, sendNotFound, toNumeric } from "./hrUtils";

const recurringCostQuerySchema = z.object({
  company_id: z.string().uuid().optional()
});

function serializeRecurringCost(row: typeof recurringCosts.$inferSelect) {
  return {
    id: row.id,
    company_id: row.companyId,
    expense_category_id: row.expenseCategoryId,
    label: row.label,
    amount: row.amount,
    currency: row.currency,
    due_day: row.dueDay,
    active: row.active,
    note: row.note,
    created_at: row.createdAt
  };
}

export async function registerRecurringCostRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/recurring-costs", { preHandler: requirePerm("finance.view") }, async (request) => {
    const query = parseWithSchema(recurringCostQuerySchema, request.query);
    const filters: SQL[] = [];

    if (query.company_id) {
      filters.push(eq(recurringCosts.companyId, query.company_id));
    }

    const rows = await db
      .select()
      .from(recurringCosts)
      .where(filters.length > 0 ? and(...filters) : sql`true`)
      .orderBy(recurringCosts.dueDay, desc(recurringCosts.createdAt));

    return { recurring_costs: rows.map(serializeRecurringCost) };
  });

  app.post("/recurring-costs", { preHandler: requirePerm("finance.manage") }, async (request, reply) => {
    const body = parseWithSchema(recurringCostCreateSchema, request.body);
    const [cost] = await db
      .insert(recurringCosts)
      .values({
        companyId: body.company_id,
        expenseCategoryId: body.expense_category_id,
        label: body.label,
        amount: toNumeric(body.amount) ?? "0",
        currency: body.currency,
        dueDay: body.due_day,
        active: body.active,
        note: body.note
      })
      .returning();

    if (!cost) {
      throw new Error("recurring_cost_create_failed");
    }

    return reply.code(201).send({ recurring_cost: serializeRecurringCost(cost) });
  });

  app.patch("/recurring-costs/:id", { preHandler: requirePerm("finance.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(recurringCostUpdateSchema, request.body);
    const amount = body.amount === undefined ? undefined : (toNumeric(body.amount) as string);

    const [cost] = await db
      .update(recurringCosts)
      .set({
        companyId: body.company_id,
        expenseCategoryId: body.expense_category_id,
        label: body.label,
        amount,
        currency: body.currency,
        dueDay: body.due_day,
        active: body.active,
        note: body.note
      })
      .where(eq(recurringCosts.id, id))
      .returning();

    if (!cost) {
      return sendNotFound(reply);
    }

    return { recurring_cost: serializeRecurringCost(cost) };
  });

  app.delete("/recurring-costs/:id", { preHandler: requirePerm("finance.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [cost] = await db.delete(recurringCosts).where(eq(recurringCosts.id, id)).returning();

    if (!cost) {
      return sendNotFound(reply);
    }

    return { ok: true };
  });
}
