import { collectionItems, db } from "@bh/db";
import { collectionItemCreateSchema, collectionItemUpdateSchema } from "@bh/shared";
import { eq } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { requirePerm } from "../auth/jwt";
import { idParamsSchema, parseWithSchema, sendNotFound } from "./hrUtils";

function serializeCollectionItem(row: typeof collectionItems.$inferSelect) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    name_en: row.nameEn,
    default_recurrence: row.defaultRecurrence,
    active: row.active,
    is_system: row.isSystem,
    sort_order: row.sortOrder,
    created_at: row.createdAt
  };
}

export async function registerCollectionItemRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/collection-items", { preHandler: requirePerm("finance.view") }, async () => {
    const rows = await db
      .select()
      .from(collectionItems)
      .orderBy(collectionItems.sortOrder, collectionItems.code);

    return { collection_items: rows.map(serializeCollectionItem) };
  });

  app.post("/collection-items", { preHandler: requirePerm("finance.manage") }, async (request, reply) => {
    const body = parseWithSchema(collectionItemCreateSchema, request.body);
    const [item] = await db
      .insert(collectionItems)
      .values({
        code: body.code,
        name: body.name,
        nameEn: body.name_en,
        defaultRecurrence: body.default_recurrence,
        active: body.active,
        sortOrder: body.sort_order
      })
      .returning();

    if (!item) {
      throw new Error("collection_item_create_failed");
    }

    return reply.code(201).send({ collection_item: serializeCollectionItem(item) });
  });

  app.patch("/collection-items/:id", { preHandler: requirePerm("finance.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(collectionItemUpdateSchema, request.body);
    const [current] = await db.select().from(collectionItems).where(eq(collectionItems.id, id)).limit(1);

    if (!current) {
      return sendNotFound(reply);
    }

    if (current.isSystem && body.code !== undefined && body.code !== current.code) {
      return reply.code(422).send({ error: "system_collection_item_code_locked" });
    }

    const [item] = await db
      .update(collectionItems)
      .set({
        code: current.isSystem ? undefined : body.code,
        name: body.name,
        nameEn: body.name_en,
        defaultRecurrence: body.default_recurrence,
        active: body.active,
        sortOrder: body.sort_order
      })
      .where(eq(collectionItems.id, id))
      .returning();

    if (!item) {
      throw new Error("collection_item_update_failed");
    }

    return { collection_item: serializeCollectionItem(item) };
  });
}
