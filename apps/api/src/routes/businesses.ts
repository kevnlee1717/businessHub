import { businesses, collectionItems, db, dealParties, schemeLines, schemeMilestones, schemeVersions } from "@bh/db";
import { businessCreateSchema, businessUpdateSchema } from "@bh/shared";
import { and, count, desc, eq, sql, type SQL } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { z } from "zod";
import { companyFilter, getAccessibleCompanyIds } from "../auth/context";
import { requirePerm } from "../auth/jwt";
import { getPagination, paginationQuery } from "../lib/pagination";
import { idParamsSchema, parseWithSchema, sendNotFound } from "./hrUtils";

const businessQuerySchema = z.object({
  company_id: z.string().uuid().optional()
}).merge(paginationQuery);

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
    const companyIds = await getAccessibleCompanyIds(request);
    const accessFilter = companyFilter(companyIds, businesses.companyId);

    if (accessFilter) {
      filters.push(accessFilter);
    }

    if (query.company_id) {
      filters.push(eq(businesses.companyId, query.company_id));
    }

    const pagination = getPagination(query);
    const whereClause = filters.length > 0 ? and(...filters) : sql`true`;
    const rows = pagination.paginate
      ? await db
          .select({
            business: businesses,
            defaultVersion: schemeVersions
          })
          .from(businesses)
          .leftJoin(schemeVersions, eq(businesses.defaultVersionId, schemeVersions.id))
          .where(whereClause)
          .orderBy(businesses.sortOrder, businesses.createdAt)
          .limit(pagination.limit)
          .offset(pagination.offset)
      : await db
          .select({
            business: businesses,
            defaultVersion: schemeVersions
          })
          .from(businesses)
          .leftJoin(schemeVersions, eq(businesses.defaultVersionId, schemeVersions.id))
          .where(whereClause)
          .orderBy(businesses.sortOrder, businesses.createdAt);

    if (pagination.paginate) {
      const [totalRow] = await db.select({ total: count() }).from(businesses).where(whereClause);

      return {
        businesses: rows.map((row) => ({
          ...serializeBusiness(row.business),
          default_version: serializeVersionBrief(row.defaultVersion),
          profit_rate: row.defaultVersion?.profitRate ?? null
        })),
        total: Number(totalRow?.total ?? 0),
        page: pagination.page,
        page_size: pagination.pageSize
      };
    }

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

    const companyIds = await getAccessibleCompanyIds(request);

    if (companyIds !== "all" && !companyIds.includes(business.companyId)) {
      return reply.code(403).send({ error: "forbidden" });
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

  // ===== ICA 极简收费&分成配置 =====
  // 存储复用 ICA 默认 scheme version 的结构:总价=revenue line rate、定金默认=定金里程碑(fixed)、
  // 担保人分成=担保人 commission line(fixed)。per-case 收款计划按此预填并直接铺定金/尾款收款项。
  const icaFeeConfigSchema = z.object({
    default_total: z.coerce.number().min(0),
    default_deposit: z.coerce.number().min(0),
    guarantor_share: z.coerce.number().min(0)
  });

  async function resolveIcaConfigContext() {
    const [business] = await db.select().from(businesses).where(eq(businesses.code, "ica")).limit(1);
    if (!business?.defaultVersionId) {
      return null;
    }
    const [guarantorParty] = await db.select().from(dealParties).where(eq(dealParties.code, "guarantor")).limit(1);
    const [depositItem] = await db.select().from(collectionItems).where(eq(collectionItems.code, "deposit")).limit(1);
    const [finalItem] = await db.select().from(collectionItems).where(eq(collectionItems.code, "final")).limit(1);
    return {
      business,
      versionId: business.defaultVersionId,
      guarantorPartyId: guarantorParty?.id ?? null,
      depositItemId: depositItem?.id ?? null,
      finalItemId: finalItem?.id ?? null
    };
  }

  app.get("/ica-fee-config", { preHandler: requirePerm("finance.view") }, async (_request, reply) => {
    const ctx = await resolveIcaConfigContext();
    if (!ctx) {
      return sendNotFound(reply);
    }
    const lines = await db.select().from(schemeLines).where(eq(schemeLines.versionId, ctx.versionId));
    const revenueLine = lines.find((line) => line.kind === "revenue");
    const guarantorLine = lines.find((line) => line.kind === "commission" && line.partyId === ctx.guarantorPartyId);
    const milestones = await db.select().from(schemeMilestones).where(eq(schemeMilestones.versionId, ctx.versionId));
    const depositMilestone =
      milestones.find((m) => m.collectionItemId === ctx.depositItemId) ?? milestones.find((m) => m.seq === 1);

    return {
      config: {
        default_total: Number(revenueLine?.rate ?? 0),
        default_deposit: Number(depositMilestone?.value ?? 0),
        guarantor_share: Number(guarantorLine?.rate ?? 0),
        currency: ctx.business.currency
      }
    };
  });

  app.put("/ica-fee-config", { preHandler: requirePerm("finance.edit") }, async (request, reply) => {
    const ctx = await resolveIcaConfigContext();
    if (!ctx) {
      return sendNotFound(reply);
    }
    const body = parseWithSchema(icaFeeConfigSchema, request.body);
    const split = { "1": { basis: "fixed" as const, value: body.guarantor_share } };

    await db.transaction(async (tx) => {
      const lines = await tx.select().from(schemeLines).where(eq(schemeLines.versionId, ctx.versionId));

      const revenueLine = lines.find((line) => line.kind === "revenue");
      if (revenueLine) {
        await tx
          .update(schemeLines)
          .set({ basis: "fixed", inputKey: "price", rate: String(body.default_total) })
          .where(eq(schemeLines.id, revenueLine.id));
      } else {
        await tx.insert(schemeLines).values({
          versionId: ctx.versionId,
          kind: "revenue",
          basis: "fixed",
          recurrence: "one_time",
          inputKey: "price",
          rate: String(body.default_total),
          label: "总价"
        });
      }

      const guarantorLine = lines.find((line) => line.kind === "commission" && line.partyId === ctx.guarantorPartyId);
      if (guarantorLine) {
        await tx
          .update(schemeLines)
          .set({ basis: "fixed", recurrence: "one_time", rate: String(body.guarantor_share), milestoneSplit: split })
          .where(eq(schemeLines.id, guarantorLine.id));
      } else if (ctx.guarantorPartyId) {
        await tx.insert(schemeLines).values({
          versionId: ctx.versionId,
          kind: "commission",
          basis: "fixed",
          recurrence: "one_time",
          partyId: ctx.guarantorPartyId,
          rate: String(body.guarantor_share),
          milestoneSplit: split,
          label: "担保人分成"
        });
      }

      const milestones = await tx.select().from(schemeMilestones).where(eq(schemeMilestones.versionId, ctx.versionId));
      const depositMilestone =
        milestones.find((m) => m.collectionItemId === ctx.depositItemId) ?? milestones.find((m) => m.seq === 1);
      if (depositMilestone) {
        await tx
          .update(schemeMilestones)
          .set({
            seq: 1,
            label: "定金",
            basis: "fixed",
            value: String(body.default_deposit),
            collectionItemId: ctx.depositItemId,
            bindStepOrder: 1
          })
          .where(eq(schemeMilestones.id, depositMilestone.id));
      } else {
        await tx.insert(schemeMilestones).values({
          versionId: ctx.versionId,
          seq: 1,
          label: "定金",
          basis: "fixed",
          value: String(body.default_deposit),
          collectionItemId: ctx.depositItemId,
          bindStepOrder: 1
        });
      }

      const finalMilestone =
        milestones.find((m) => m.collectionItemId === ctx.finalItemId) ?? milestones.find((m) => m.seq === 2);
      if (!finalMilestone) {
        await tx.insert(schemeMilestones).values({
          versionId: ctx.versionId,
          seq: 2,
          label: "尾款",
          basis: "percent",
          value: "100",
          collectionItemId: ctx.finalItemId
        });
      }
    });

    return { ok: true };
  });
}
