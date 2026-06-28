import { businesses, db, schemeVersions } from "@bh/db";
import { businessCreateSchema, businessUpdateSchema } from "@bh/shared";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { z } from "zod";
import { requirePerm } from "../auth/jwt";
import { idParamsSchema, parseWithSchema, sendNotFound } from "./hrUtils";

const businessQuerySchema = z.object({
  company_id: z.string().uuid().optional()
});

function serializeVersionBrief(row: typeof schemeVersions.$inferSelect | null | undefined) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    label: row.label,
    status: row.status,
    effective_from: row.effectiveFrom,
    effective_to: row.effectiveTo,
    profit_rate: row.profitRate
  };
}

function serializeBusiness(row: typeof businesses.$inferSelect) {
  return {
    id: row.id,
    company_id: row.companyId,
    code: row.code,
    name: row.name,
    name_en: row.nameEn,
    category: row.category,
    status: row.status,
    currency: row.currency,
    default_version_id: row.defaultVersionId,
    sort_order: row.sortOrder,
    note: row.note,
    created_at: row.createdAt
  };
}

export async function registerBusinessRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/businesses", { preHandler: requirePerm("finance.view") }, async (request) => {
    const query = parseWithSchema(businessQuerySchema, request.query);
    const filters: SQL[] = [];

    if (query.company_id) {
      filters.push(eq(businesses.companyId, query.company_id));
    }

    const rows = await db
      .select({
        business: businesses,
        defaultVersion: schemeVersions
      })
      .from(businesses)
      .leftJoin(schemeVersions, eq(businesses.defaultVersionId, schemeVersions.id))
      .where(filters.length > 0 ? and(...filters) : sql`true`)
      .orderBy(businesses.sortOrder, businesses.createdAt);

    return {
      businesses: rows.map((row) => ({
        ...serializeBusiness(row.business),
        default_version: serializeVersionBrief(row.defaultVersion),
        profit_rate: row.defaultVersion?.profitRate ?? null
      }))
    };
  });

  app.get("/businesses/:id", { preHandler: requirePerm("finance.view") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [business] = await db.select().from(businesses).where(eq(businesses.id, id)).limit(1);

    if (!business) {
      return sendNotFound(reply);
    }

    const versions = await db
      .select()
      .from(schemeVersions)
      .where(eq(schemeVersions.businessId, id))
      .orderBy(desc(schemeVersions.createdAt));

    return {
      business: {
        ...serializeBusiness(business),
        scheme_versions: versions.map(serializeVersionBrief)
      }
    };
  });

  app.post("/businesses", { preHandler: requirePerm("finance.edit") }, async (request, reply) => {
    const body = parseWithSchema(businessCreateSchema, request.body);
    const [business] = await db
      .insert(businesses)
      .values({
        companyId: body.company_id,
        code: body.code,
        name: body.name,
        nameEn: body.name_en,
        category: body.category,
        status: body.status,
        currency: body.currency,
        sortOrder: body.sort_order
      })
      .returning();

    if (!business) {
      throw new Error("business_create_failed");
    }

    return reply.code(201).send({ business: serializeBusiness(business) });
  });

  app.patch("/businesses/:id", { preHandler: requirePerm("finance.edit") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(businessUpdateSchema, request.body);

    if (body.default_version_id) {
      const [version] = await db
        .select()
        .from(schemeVersions)
        .where(
          and(eq(schemeVersions.id, body.default_version_id), eq(schemeVersions.businessId, id))
        )
        .limit(1);

      if (!version) {
        return reply.code(400).send({ error: "default_version_not_in_business" });
      }
    }

    const [business] = await db
      .update(businesses)
      .set({
        companyId: body.company_id,
        code: body.code,
        name: body.name,
        nameEn: body.name_en,
        category: body.category,
        status: body.status,
        currency: body.currency,
        defaultVersionId: body.default_version_id,
        sortOrder: body.sort_order
      })
      .where(eq(businesses.id, id))
      .returning();

    if (!business) {
      return sendNotFound(reply);
    }

    return { business: serializeBusiness(business) };
  });
}
