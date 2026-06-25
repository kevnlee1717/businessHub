import { db, positions } from "@bh/db";
import { positionCreateSchema, positionUpdateSchema } from "@bh/shared";
import { eq } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { requirePerm } from "../auth/jwt";
import { idParamsSchema, parseWithSchema, sendNotFound } from "./hrUtils";

function serializePosition(position: typeof positions.$inferSelect) {
  return {
    id: position.id,
    name: position.name,
    name_en: position.nameEn,
    note: position.note,
    created_at: position.createdAt
  };
}

export async function registerPositionRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/positions", async () => {
    const rows = await db.select().from(positions).orderBy(positions.createdAt);
    return { positions: rows.map(serializePosition) };
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
        note: body.note
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
    const [position] = await db
      .update(positions)
      .set({
        name: body.name,
        nameEn: body.name_en,
        note: body.note
      })
      .where(eq(positions.id, id))
      .returning();

    if (!position) {
      return sendNotFound(reply);
    }

    return { position: serializePosition(position) };
  });
}
