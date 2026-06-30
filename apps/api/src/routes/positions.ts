import { db, positions } from "@bh/db";
import { positionCreateSchema, positionUpdateSchema } from "@bh/shared";
import { count, eq } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { z } from "zod";
import { requirePerm } from "../auth/jwt";
import { getPagination, paginationQuery } from "../lib/pagination";
import { idParamsSchema, parseWithSchema, sendNotFound } from "./hrUtils";

const positionQuerySchema = z.object({}).merge(paginationQuery);

function serializePosition(position: typeof positions.$inferSelect) {
  return {
    id: position.id,
    name: position.name,
    name_en: position.nameEn,
    note: position.note,
    permissions: position.permissions,
    data_scope: position.dataScope,
    is_system: position.isSystem,
    sort_order: position.sortOrder,
    created_at: position.createdAt
  };
}

export async function registerPositionRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/positions", async (request) => {
    const query = parseWithSchema(positionQuerySchema, request.query);
    const pagination = getPagination(query);
    const rows = pagination.paginate
      ? await db
          .select()
          .from(positions)
          .orderBy(positions.sortOrder, positions.createdAt)
          .limit(pagination.limit)
          .offset(pagination.offset)
      : await db.select().from(positions).orderBy(positions.sortOrder, positions.createdAt);

    if (!pagination.paginate) {
      return { positions: rows.map(serializePosition) };
    }

    const [totalRow] = await db.select({ total: count() }).from(positions);

    return {
      positions: rows.map(serializePosition),
      total: totalRow?.total ?? 0,
      page: pagination.page,
      page_size: pagination.pageSize
    };
  });

  app.get("/positions/:id", async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [position] = await db.select().from(positions).where(eq(positions.id, id)).limit(1);

    if (!position) {
      return sendNotFound(reply);
    }

    return { position: serializePosition(position) };
  });

  app.post("/positions", { preHandler: requirePerm("company.manage") }, async (request, reply) => {
    const body = parseWithSchema(positionCreateSchema, request.body);
    const [position] = await db
      .insert(positions)
      .values({
        name: body.name,
        nameEn: body.name_en,
        note: body.note,
        permissions: body.permissions,
        dataScope: body.data_scope,
        sortOrder: body.sort_order
      })
      .returning();

    if (!position) {
      throw new Error("position_create_failed");
    }

    return reply.code(201).send({ position: serializePosition(position) });
  });

  app.patch("/positions/:id", { preHandler: requirePerm("company.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(positionUpdateSchema, request.body);
    const [existing] = await db.select().from(positions).where(eq(positions.id, id)).limit(1);

    if (!existing) {
      return sendNotFound(reply);
    }

    if (existing.isSystem) {
      return reply.code(403).send({ error: "system_position_readonly" });
    }

    const [position] = await db
      .update(positions)
      .set({
        name: body.name,
        nameEn: body.name_en,
        note: body.note,
        permissions: body.permissions,
        dataScope: body.data_scope,
        sortOrder: body.sort_order
      })
      .where(eq(positions.id, id))
      .returning();

    if (!position) {
      return sendNotFound(reply);
    }

    return { position: serializePosition(position) };
  });
}
