import { db, documentCategories } from "@bh/db";
import { documentCategoryCreateSchema, documentCategoryUpdateSchema } from "@bh/shared";
import { asc, count, desc, eq } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { requirePerm } from "../auth/jwt";
import { getPagination, paginationQuery } from "../lib/pagination";
import { idParamsSchema, parseWithSchema, sendNotFound } from "./hrUtils";

function serializeCategory(row: typeof documentCategories.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    name_en: row.nameEn,
    parent_id: row.parentId,
    is_system: row.isSystem,
    active: row.active,
    created_at: row.createdAt
  };
}

export async function registerDocumentCategoryRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/document-categories", { preHandler: requirePerm("document.view") }, async (request) => {
    const query = parseWithSchema(paginationQuery, request.query);
    const pagination = getPagination(query);
    const rows = pagination.paginate
      ? await db
          .select()
          .from(documentCategories)
          .orderBy(desc(documentCategories.active), asc(documentCategories.name))
          .limit(pagination.limit)
          .offset(pagination.offset)
      : await db
          .select()
          .from(documentCategories)
          .orderBy(desc(documentCategories.active), asc(documentCategories.name));

    if (!pagination.paginate) {
      return { categories: rows.map(serializeCategory) };
    }

    const [totalRow] = await db.select({ value: count() }).from(documentCategories);

    return {
      categories: rows.map(serializeCategory),
      total: totalRow?.value ?? 0,
      page: pagination.page,
      page_size: pagination.pageSize
    };
  });

  app.post("/document-categories", { preHandler: requirePerm("document.manage") }, async (request, reply) => {
    const body = parseWithSchema(documentCategoryCreateSchema, request.body);
    const [category] = await db
      .insert(documentCategories)
      .values({
        name: body.name,
        nameEn: body.name_en,
        parentId: body.parent_id,
        active: body.active
      })
      .returning();

    if (!category) {
      throw new Error("document_category_create_failed");
    }

    return reply.code(201).send({ category: serializeCategory(category) });
  });

  app.patch("/document-categories/:id", { preHandler: requirePerm("document.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(documentCategoryUpdateSchema, request.body);
    const [category] = await db
      .update(documentCategories)
      .set({
        name: body.name,
        nameEn: body.name_en,
        parentId: body.parent_id,
        active: body.active
      })
      .where(eq(documentCategories.id, id))
      .returning();

    if (!category) {
      return sendNotFound(reply);
    }

    return { category: serializeCategory(category) };
  });
}
