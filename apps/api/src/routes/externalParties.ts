import { randomBytes } from "node:crypto";
import { db, externalParties } from "@bh/db";
import { externalPartyCreateSchema, externalPartyUpdateSchema } from "@bh/shared";
import { and, eq, sql, type SQL } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { z } from "zod";
import { requirePerm } from "../auth/jwt";
import { idParamsSchema, parseWithSchema, sendNotFound } from "./hrUtils";

const externalPartiesQuerySchema = z.object({
  party_id: z.string().uuid().optional()
});

function statementToken() {
  return randomBytes(24).toString("hex");
}

function serializeExternalParty(row: typeof externalParties.$inferSelect) {
  return {
    id: row.id,
    party_id: row.partyId,
    name: row.name,
    name_en: row.nameEn,
    contact: row.contact,
    note: row.note,
    active: row.active,
    statement_token: row.statementToken,
    created_at: row.createdAt
  };
}

export async function registerExternalPartyRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/external-parties", { preHandler: requirePerm("finance.view") }, async (request) => {
    const query = parseWithSchema(externalPartiesQuerySchema, request.query);
    const filters: SQL[] = [];

    if (query.party_id) {
      filters.push(eq(externalParties.partyId, query.party_id));
    }

    const rows = await db
      .select()
      .from(externalParties)
      .where(filters.length > 0 ? and(...filters) : sql`true`)
      .orderBy(externalParties.createdAt);

    return { external_parties: rows.map(serializeExternalParty) };
  });

  app.post("/external-parties", { preHandler: requirePerm("finance.edit") }, async (request, reply) => {
    const body = parseWithSchema(externalPartyCreateSchema, request.body);
    const [party] = await db
      .insert(externalParties)
      .values({
        partyId: body.party_id,
        name: body.name,
        nameEn: body.name_en,
        contact: body.contact,
        note: body.note,
        active: body.active,
        statementToken: statementToken()
      })
      .returning();

    if (!party) {
      throw new Error("external_party_create_failed");
    }

    return reply.code(201).send({ external_party: serializeExternalParty(party) });
  });

  app.patch("/external-parties/:id", { preHandler: requirePerm("finance.edit") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(externalPartyUpdateSchema, request.body);
    const [party] = await db
      .update(externalParties)
      .set({
        partyId: body.party_id,
        name: body.name,
        nameEn: body.name_en,
        contact: body.contact,
        note: body.note,
        active: body.active
      })
      .where(eq(externalParties.id, id))
      .returning();

    if (!party) {
      return sendNotFound(reply);
    }

    return { external_party: serializeExternalParty(party) };
  });

  app.delete("/external-parties/:id", { preHandler: requirePerm("finance.edit") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [party] = await db.delete(externalParties).where(eq(externalParties.id, id)).returning();

    if (!party) {
      return sendNotFound(reply);
    }

    return { ok: true };
  });

  app.post(
    "/external-parties/:id/rotate-token",
    { preHandler: requirePerm("finance.edit") },
    async (request, reply) => {
      const { id } = parseWithSchema(idParamsSchema, request.params);
      const [party] = await db
        .update(externalParties)
        .set({ statementToken: statementToken() })
        .where(eq(externalParties.id, id))
        .returning();

      if (!party) {
        return sendNotFound(reply);
      }

      return { external_party: serializeExternalParty(party) };
    }
  );
}
