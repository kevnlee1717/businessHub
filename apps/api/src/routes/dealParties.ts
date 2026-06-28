import { db, dealParties } from "@bh/db";
import { dealPartyCreateSchema, dealPartyUpdateSchema } from "@bh/shared";
import { eq } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { requirePerm } from "../auth/jwt";
import { idParamsSchema, parseWithSchema, sendNotFound } from "./hrUtils";

function serializeDealParty(row: typeof dealParties.$inferSelect) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    name_en: row.nameEn,
    active: row.active,
    is_system: row.isSystem,
    created_at: row.createdAt
  };
}

export async function registerDealPartyRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/deal-parties", { preHandler: requirePerm("finance.view") }, async () => {
    const rows = await db.select().from(dealParties).orderBy(dealParties.createdAt);
    return { deal_parties: rows.map(serializeDealParty) };
  });

  app.post("/deal-parties", { preHandler: requirePerm("finance.edit") }, async (request, reply) => {
    const body = parseWithSchema(dealPartyCreateSchema, request.body);
    const [party] = await db
      .insert(dealParties)
      .values({
        code: body.code,
        name: body.name,
        nameEn: body.name_en,
        active: body.active
      })
      .returning();

    if (!party) {
      throw new Error("deal_party_create_failed");
    }

    return reply.code(201).send({ deal_party: serializeDealParty(party) });
  });

  app.patch("/deal-parties/:id", { preHandler: requirePerm("finance.edit") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(dealPartyUpdateSchema, request.body);
    const [current] = await db.select().from(dealParties).where(eq(dealParties.id, id)).limit(1);

    if (!current) {
      return sendNotFound(reply);
    }

    if (current.isSystem && body.code !== undefined && body.code !== current.code) {
      return reply.code(400).send({ error: "system_party_code_locked" });
    }

    const [party] = await db
      .update(dealParties)
      .set({
        code: current.isSystem ? undefined : body.code,
        name: body.name,
        nameEn: body.name_en,
        active: body.active
      })
      .where(eq(dealParties.id, id))
      .returning();

    if (!party) {
      return sendNotFound(reply);
    }

    return { deal_party: serializeDealParty(party) };
  });
}
