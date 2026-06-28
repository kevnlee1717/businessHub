import { db, expenseCategories } from "@bh/db";
import { expenseCategoryCreateSchema, expenseCategoryUpdateSchema } from "@bh/shared";
import { eq } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { requirePerm } from "../auth/jwt";
import { idParamsSchema, parseWithSchema, sendNotFound } from "./hrUtils";
import { serializeExpenseCategory } from "./ledgerUtils";

export async function registerExpenseCategoryRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/expense-categories", { preHandler: requirePerm("finance.view") }, async () => {
    const rows = await db
      .select()
      .from(expenseCategories)
      .orderBy(expenseCategories.isSystem, expenseCategories.code);

    return { expense_categories: rows.map(serializeExpenseCategory) };
  });

  app.post("/expense-categories", { preHandler: requirePerm("finance.edit") }, async (request, reply) => {
    const body = parseWithSchema(expenseCategoryCreateSchema, request.body);
    const [category] = await db
      .insert(expenseCategories)
      .values({
        code: body.code,
        name: body.name,
        nameEn: body.name_en,
        active: body.active,
        isSystem: body.is_system
      })
      .returning();

    if (!category) {
      throw new Error("expense_category_create_failed");
    }

    return reply.code(201).send({ expense_category: serializeExpenseCategory(category) });
  });

  app.patch("/expense-categories/:id", { preHandler: requirePerm("finance.edit") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(expenseCategoryUpdateSchema, request.body);
    const [current] = await db.select().from(expenseCategories).where(eq(expenseCategories.id, id)).limit(1);

    if (!current) {
      return sendNotFound(reply);
    }
    if (current.isSystem && body.code !== undefined && body.code !== current.code) {
      return reply.code(422).send({ error: "system_category_code_locked" });
    }

    const [category] = await db
      .update(expenseCategories)
      .set({
        code: current.isSystem ? undefined : body.code,
        name: body.name,
        nameEn: body.name_en,
        reportSection: body.report_section,
        active: body.active,
        isSystem: body.is_system
      })
      .where(eq(expenseCategories.id, id))
      .returning();

    if (!category) {
      throw new Error("expense_category_update_failed");
    }

    return { expense_category: serializeExpenseCategory(category) };
  });
}
