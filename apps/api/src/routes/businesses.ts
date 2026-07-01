import { businesses, collectionItems, db, dealParties, schemeLines, schemeMilestones, schemeVersions } from "@bh/db";
import { businessCreateSchema, businessUpdateSchema } from "@bh/shared";
import { and, asc, count, desc, eq, sql, type SQL } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { z } from "zod";
import { companyFilter, getAccessibleCompanyIds } from "../auth/context";
import { requirePerm } from "../auth/jwt";
import { getPagination, paginationQuery } from "../lib/pagination";
import { idParamsSchema, parseWithSchema, sendNotFound } from "./hrUtils";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

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
  // 存储复用 ICA scheme version 的结构:总价=revenue line rate、定金默认=定金里程碑(fixed)、
  // 担保人分成=担保人 commission line(fixed)。per-case 收款计划按案件选择的方案预填。
  const icaFeeConfigSchema = z.object({
    default_total: z.coerce.number().min(0),
    default_deposit: z.coerce.number().min(0),
    guarantor_share: z.coerce.number().min(0)
  });
  const icaFeeSchemeCreateSchema = icaFeeConfigSchema.extend({
    label: z.string().trim().min(1)
  });
  const icaFeeSchemeUpdateSchema = icaFeeConfigSchema.extend({
    label: z.string().trim().min(1).optional()
  });
  const icaFeeSchemeParamsSchema = z.object({
    versionId: z.string().uuid()
  });

  async function resolveIcaConfigContext() {
    const [business] = await db.select().from(businesses).where(eq(businesses.code, "ica")).limit(1);
    if (!business) {
      return null;
    }
    const [guarantorParty] = await db.select().from(dealParties).where(eq(dealParties.code, "guarantor")).limit(1);
    const [depositItem] = await db.select().from(collectionItems).where(eq(collectionItems.code, "deposit")).limit(1);
    const [finalItem] = await db.select().from(collectionItems).where(eq(collectionItems.code, "final")).limit(1);
    return {
      business,
      guarantorPartyId: guarantorParty?.id ?? null,
      depositItemId: depositItem?.id ?? null,
      finalItemId: finalItem?.id ?? null
    };
  }

  async function readIcaSchemeValues(
    versionId: string,
    ctx: NonNullable<Awaited<ReturnType<typeof resolveIcaConfigContext>>>
  ) {
    const lines = await db.select().from(schemeLines).where(eq(schemeLines.versionId, versionId));
    const revenueLine = lines.find((line) => line.kind === "revenue");
    const guarantorLine = lines.find((line) => line.kind === "commission" && line.partyId === ctx.guarantorPartyId);
    const milestones = await db.select().from(schemeMilestones).where(eq(schemeMilestones.versionId, versionId));
    const depositMilestone =
      milestones.find((m) => m.collectionItemId === ctx.depositItemId) ?? milestones.find((m) => m.seq === 1);

    return {
      default_total: Number(revenueLine?.rate ?? 0),
      default_deposit: Number(depositMilestone?.value ?? 0),
      guarantor_share: Number(guarantorLine?.rate ?? 0)
    };
  }

  async function writeIcaSchemeValues(
    tx: DbTransaction,
    versionId: string,
    ctx: NonNullable<Awaited<ReturnType<typeof resolveIcaConfigContext>>>,
    values: z.infer<typeof icaFeeConfigSchema>
  ) {
    const split = { "1": { basis: "fixed" as const, value: values.guarantor_share } };

    const lines = await tx.select().from(schemeLines).where(eq(schemeLines.versionId, versionId));

    const revenueLine = lines.find((line) => line.kind === "revenue");
    if (revenueLine) {
      await tx
        .update(schemeLines)
        .set({ basis: "fixed", inputKey: "price", rate: String(values.default_total) })
        .where(eq(schemeLines.id, revenueLine.id));
    } else {
      await tx.insert(schemeLines).values({
        versionId,
        kind: "revenue",
        basis: "fixed",
        recurrence: "one_time",
        inputKey: "price",
        rate: String(values.default_total),
        label: "总价"
      });
    }

    const guarantorLine = lines.find((line) => line.kind === "commission" && line.partyId === ctx.guarantorPartyId);
    if (guarantorLine) {
      await tx
        .update(schemeLines)
        .set({ basis: "fixed", recurrence: "one_time", rate: String(values.guarantor_share), milestoneSplit: split })
        .where(eq(schemeLines.id, guarantorLine.id));
    } else if (ctx.guarantorPartyId) {
      await tx.insert(schemeLines).values({
        versionId,
        kind: "commission",
        basis: "fixed",
        recurrence: "one_time",
        partyId: ctx.guarantorPartyId,
        rate: String(values.guarantor_share),
        milestoneSplit: split,
        label: "担保人分成"
      });
    }

    const milestones = await tx.select().from(schemeMilestones).where(eq(schemeMilestones.versionId, versionId));
    const depositMilestone =
      milestones.find((m) => m.collectionItemId === ctx.depositItemId) ?? milestones.find((m) => m.seq === 1);
    if (depositMilestone) {
      await tx
        .update(schemeMilestones)
        .set({
          seq: 1,
          label: "定金",
          basis: "fixed",
          value: String(values.default_deposit),
          collectionItemId: ctx.depositItemId,
          bindStepOrder: 1
        })
        .where(eq(schemeMilestones.id, depositMilestone.id));
    } else {
      await tx.insert(schemeMilestones).values({
        versionId,
        seq: 1,
        label: "定金",
        basis: "fixed",
        value: String(values.default_deposit),
        collectionItemId: ctx.depositItemId,
        bindStepOrder: 1
      });
    }

    const finalMilestone =
      milestones.find((m) => m.collectionItemId === ctx.finalItemId) ?? milestones.find((m) => m.seq === 2);
    if (!finalMilestone) {
      await tx.insert(schemeMilestones).values({
        versionId,
        seq: 2,
        label: "尾款",
        basis: "percent",
        value: "100",
        collectionItemId: ctx.finalItemId
      });
    }
  }

  async function ensureActiveIcaScheme(versionId: string, businessId: string) {
    const [version] = await db
      .select()
      .from(schemeVersions)
      .where(
        and(
          eq(schemeVersions.id, versionId),
          eq(schemeVersions.businessId, businessId),
          eq(schemeVersions.status, "active")
        )
      )
      .limit(1);

    return version ?? null;
  }

  app.get("/ica-fee-config", { preHandler: requirePerm("finance.view") }, async (_request, reply) => {
    const ctx = await resolveIcaConfigContext();
    if (!ctx?.business.defaultVersionId) {
      return sendNotFound(reply);
    }
    const values = await readIcaSchemeValues(ctx.business.defaultVersionId, ctx);

    return {
      config: {
        ...values,
        currency: ctx.business.currency
      }
    };
  });

  app.get("/ica-fee-schemes", { preHandler: requirePerm("finance.view") }, async (_request, reply) => {
    const ctx = await resolveIcaConfigContext();
    if (!ctx) {
      return sendNotFound(reply);
    }

    const versions = await db
      .select()
      .from(schemeVersions)
      .where(and(eq(schemeVersions.businessId, ctx.business.id), eq(schemeVersions.status, "active")))
      .orderBy(asc(schemeVersions.createdAt));

    const schemes = await Promise.all(
      versions.map(async (version) => ({
        id: version.id,
        label: version.label,
        is_default: version.id === ctx.business.defaultVersionId,
        ...(await readIcaSchemeValues(version.id, ctx))
      }))
    );

    return {
      currency: ctx.business.currency,
      schemes
    };
  });

  app.post("/ica-fee-schemes", { preHandler: requirePerm("finance.edit") }, async (request, reply) => {
    const ctx = await resolveIcaConfigContext();
    if (!ctx) {
      return sendNotFound(reply);
    }
    const body = parseWithSchema(icaFeeSchemeCreateSchema, request.body);

    const scheme = await db.transaction(async (tx) => {
      const [version] = await tx
        .insert(schemeVersions)
        .values({
          businessId: ctx.business.id,
          label: body.label,
          status: "active"
        })
        .returning();

      if (!version) {
        throw new Error("ica_fee_scheme_create_failed");
      }

      await writeIcaSchemeValues(tx, version.id, ctx, body);

      if (!ctx.business.defaultVersionId) {
        await tx.update(businesses).set({ defaultVersionId: version.id }).where(eq(businesses.id, ctx.business.id));
      }

      return {
        id: version.id,
        label: version.label,
        is_default: !ctx.business.defaultVersionId,
        default_total: body.default_total,
        default_deposit: body.default_deposit,
        guarantor_share: body.guarantor_share
      };
    });

    return reply.code(201).send({ scheme, currency: ctx.business.currency });
  });

  app.put("/ica-fee-schemes/:versionId", { preHandler: requirePerm("finance.edit") }, async (request, reply) => {
    const ctx = await resolveIcaConfigContext();
    if (!ctx) {
      return sendNotFound(reply);
    }
    const { versionId } = parseWithSchema(icaFeeSchemeParamsSchema, request.params);
    const body = parseWithSchema(icaFeeSchemeUpdateSchema, request.body);

    const scheme = await db.transaction(async (tx) => {
      const [version] = await tx
        .select()
        .from(schemeVersions)
        .where(
          and(
            eq(schemeVersions.id, versionId),
            eq(schemeVersions.businessId, ctx.business.id),
            eq(schemeVersions.status, "active")
          )
        )
        .limit(1);

      if (!version) {
        return null;
      }

      await writeIcaSchemeValues(tx, versionId, ctx, body);

      if (body.label !== undefined) {
        await tx.update(schemeVersions).set({ label: body.label }).where(eq(schemeVersions.id, versionId));
      }

      return {
        id: versionId,
        label: body.label ?? version.label,
        is_default: versionId === ctx.business.defaultVersionId,
        default_total: body.default_total,
        default_deposit: body.default_deposit,
        guarantor_share: body.guarantor_share
      };
    });

    if (!scheme) {
      return sendNotFound(reply);
    }

    return {
      scheme,
      currency: ctx.business.currency
    };
  });

  app.post(
    "/ica-fee-schemes/:versionId/default",
    { preHandler: requirePerm("finance.edit") },
    async (request, reply) => {
      const ctx = await resolveIcaConfigContext();
      if (!ctx) {
        return sendNotFound(reply);
      }
      const { versionId } = parseWithSchema(icaFeeSchemeParamsSchema, request.params);
      const version = await ensureActiveIcaScheme(versionId, ctx.business.id);
      if (!version) {
        return sendNotFound(reply);
      }

      await db.update(businesses).set({ defaultVersionId: versionId }).where(eq(businesses.id, ctx.business.id));

      return { ok: true };
    }
  );

  app.delete("/ica-fee-schemes/:versionId", { preHandler: requirePerm("finance.edit") }, async (request, reply) => {
    const ctx = await resolveIcaConfigContext();
    if (!ctx) {
      return sendNotFound(reply);
    }
    const { versionId } = parseWithSchema(icaFeeSchemeParamsSchema, request.params);
    const version = await ensureActiveIcaScheme(versionId, ctx.business.id);
    if (!version) {
      return sendNotFound(reply);
    }
    if (versionId === ctx.business.defaultVersionId) {
      return reply.code(400).send({ error: "cannot_delete_default_scheme" });
    }

    await db.update(schemeVersions).set({ status: "closed" }).where(eq(schemeVersions.id, versionId));

    return { ok: true };
  });
}
