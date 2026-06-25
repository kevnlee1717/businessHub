import { clients, db } from "@bh/db";
import { clientCreateSchema, clientUpdateSchema } from "@bh/shared";
import { desc, eq } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { requirePerm } from "../auth/jwt";
import { idParamsSchema, parseWithSchema, sendNotFound } from "./hrUtils";

function serializeClient(client: typeof clients.$inferSelect) {
  return {
    id: client.id,
    name: client.name,
    name_en: client.nameEn,
    phone: client.phone,
    email: client.email,
    note: client.note,
    created_at: client.createdAt,
    updated_at: client.updatedAt
  };
}

export async function registerClientRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/clients", { preHandler: requirePerm("case.view") }, async () => {
    const rows = await db.select().from(clients).orderBy(desc(clients.createdAt));
    return { clients: rows.map(serializeClient) };
  });

  app.get("/clients/:id", { preHandler: requirePerm("case.view") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [client] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);

    if (!client) {
      return sendNotFound(reply);
    }

    return { client: serializeClient(client) };
  });

  app.post("/clients", { preHandler: requirePerm("case.manage") }, async (request, reply) => {
    const body = parseWithSchema(clientCreateSchema, request.body);
    const [client] = await db
      .insert(clients)
      .values({
        name: body.name,
        nameEn: body.name_en,
        phone: body.phone,
        email: body.email,
        note: body.note
      })
      .returning();

    if (!client) {
      throw new Error("client_create_failed");
    }

    return reply.code(201).send({ client: serializeClient(client) });
  });

  app.patch("/clients/:id", { preHandler: requirePerm("case.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(clientUpdateSchema, request.body);
    const [client] = await db
      .update(clients)
      .set({
        name: body.name,
        nameEn: body.name_en,
        phone: body.phone,
        email: body.email,
        note: body.note,
        updatedAt: new Date()
      })
      .where(eq(clients.id, id))
      .returning();

    if (!client) {
      return sendNotFound(reply);
    }

    return { client: serializeClient(client) };
  });
}
