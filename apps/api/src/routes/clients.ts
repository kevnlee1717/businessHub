import { clients, db } from "@bh/db";
import { clientCreateSchema, clientUpdateSchema } from "@bh/shared";
import { count, desc, eq } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { pinyin } from "pinyin-pro";
import { z } from "zod";
import { requirePerm } from "../auth/jwt";
import { getPagination, paginationQuery } from "../lib/pagination";
import { idParamsSchema, parseWithSchema, sendNotFound } from "./hrUtils";

const CJK_RE = /[一-鿿]/;

// 中文名客户自动生成拼音英文名:有英文名则用英文名;否则若 name 含中文,转拼音(首字母大写、空格分隔)
function resolveNameEn(name: string | undefined, nameEn: string | undefined): string | undefined {
  if (nameEn) {
    return nameEn;
  }
  if (name && CJK_RE.test(name)) {
    return pinyin(name, { toneType: "none", type: "array" })
      .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
      .join(" ");
  }
  return nameEn;
}

function serializeClient(client: typeof clients.$inferSelect) {
  return {
    id: client.id,
    name: client.name,
    name_en: client.nameEn,
    nationality: client.nationality,
    phone: client.phone,
    email: client.email,
    note: client.note,
    created_at: client.createdAt,
    updated_at: client.updatedAt
  };
}

const clientQuerySchema = z.object({}).merge(paginationQuery);

export async function registerClientRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/clients", { preHandler: requirePerm("case.view") }, async (request) => {
    const query = parseWithSchema(clientQuerySchema, request.query);
    const pagination = getPagination(query);
    const rows = pagination.paginate
      ? await db
          .select()
          .from(clients)
          .orderBy(desc(clients.createdAt))
          .limit(pagination.limit)
          .offset(pagination.offset)
      : await db.select().from(clients).orderBy(desc(clients.createdAt));

    if (pagination.paginate) {
      const [totalRow] = await db.select({ total: count() }).from(clients);

      return {
        clients: rows.map(serializeClient),
        total: Number(totalRow?.total ?? 0),
        page: pagination.page,
        page_size: pagination.pageSize
      };
    }

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
        nameEn: resolveNameEn(body.name, body.name_en),
        nationality: body.nationality,
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
        nameEn: resolveNameEn(body.name, body.name_en),
        nationality: body.nationality,
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
