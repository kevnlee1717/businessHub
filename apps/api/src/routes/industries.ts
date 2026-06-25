import { db, industries } from "@bh/db";
import { industryCreateSchema, industryUpdateSchema } from "@bh/shared";
import { eq } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { requirePerm } from "../auth/jwt";
import { idParamsSchema, parseWithSchema, sendNotFound } from "./hrUtils";

function serializeIndustry(industry: typeof industries.$inferSelect) {
  return {
    id: industry.id,
    name: industry.name,
    name_en: industry.nameEn,
    active: industry.active,
    created_at: industry.createdAt
  };
}

export async function registerIndustryRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/industries", async () => {
    const rows = await db.select().from(industries).orderBy(industries.name);
    return { industries: rows.map(serializeIndustry) };
  });

  app.post("/industries", { preHandler: requirePerm("company.manage") }, async (request, reply) => {
    const body = parseWithSchema(industryCreateSchema, request.body);
    const [industry] = await db
      .insert(industries)
      .values({
        name: body.name,
        nameEn: body.name_en,
        active: body.active
      })
      .returning();

    if (!industry) {
      throw new Error("industry_create_failed");
    }

    return reply.code(201).send({ industry: serializeIndustry(industry) });
  });

  app.patch("/industries/:id", { preHandler: requirePerm("company.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(industryUpdateSchema, request.body);
    const [industry] = await db
      .update(industries)
      .set({
        name: body.name,
        nameEn: body.name_en,
        active: body.active
      })
      .where(eq(industries.id, id))
      .returning();

    if (!industry) {
      return sendNotFound(reply);
    }

    return { industry: serializeIndustry(industry) };
  });

  app.delete("/industries/:id", { preHandler: requirePerm("company.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [industry] = await db.delete(industries).where(eq(industries.id, id)).returning({ id: industries.id });

    if (!industry) {
      return sendNotFound(reply);
    }

    return { ok: true };
  });
}
