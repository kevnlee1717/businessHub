import { companies, db } from "@bh/db";
import { companyCreateSchema, companyUpdateSchema } from "@bh/shared";
import { eq } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { requirePerm } from "../auth/jwt";
import { idParamsSchema, parseWithSchema, sendNotFound } from "./hrUtils";

function serializeCompany(company: typeof companies.$inferSelect) {
  return {
    id: company.id,
    name: company.name,
    name_en: company.nameEn,
    uen: company.uen,
    industry_id: company.industryId,
    shift_id: company.shiftId,
    status: company.status,
    note: company.note,
    created_at: company.createdAt
  };
}

export async function registerCompanyRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/companies", async () => {
    const rows = await db.select().from(companies).orderBy(companies.createdAt);
    return { companies: rows.map(serializeCompany) };
  });

  app.get("/companies/:id", async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [company] = await db.select().from(companies).where(eq(companies.id, id)).limit(1);

    if (!company) {
      return sendNotFound(reply);
    }

    return { company: serializeCompany(company) };
  });

  app.post("/companies", { preHandler: requirePerm("company.manage") }, async (request, reply) => {
    const body = parseWithSchema(companyCreateSchema, request.body);
    const [company] = await db
      .insert(companies)
      .values({
        name: body.name,
        nameEn: body.name_en,
        uen: body.uen,
        industryId: body.industry_id,
        shiftId: body.shift_id,
        status: body.status,
        note: body.note
      })
      .returning();

    if (!company) {
      throw new Error("company_create_failed");
    }

    return reply.code(201).send({ company: serializeCompany(company) });
  });

  app.patch("/companies/:id", { preHandler: requirePerm("company.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(companyUpdateSchema, request.body);
    const [company] = await db
      .update(companies)
      .set({
        name: body.name,
        nameEn: body.name_en,
        uen: body.uen,
        industryId: body.industry_id,
        shiftId: body.shift_id,
        status: body.status,
        note: body.note
      })
      .where(eq(companies.id, id))
      .returning();

    if (!company) {
      return sendNotFound(reply);
    }

    return { company: serializeCompany(company) };
  });
}
