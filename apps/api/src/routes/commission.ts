import { billing, businesses, commissionEntries, db, employees } from "@bh/db";
import {
  commissionEntryCreateSchema,
  commissionEntryStatusSchema,
  commissionEntryUpdateSchema
} from "@bh/shared";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { z } from "zod";
import { companyFilter, getAccessibleCompanyIds } from "../auth/context";
import { requirePerm } from "../auth/jwt";
import { generateCommissionEntries } from "./commissionUtils";
import { idParamsSchema, parseWithSchema, sendNotFound, toNumeric } from "./hrUtils";

const commissionEntriesQuerySchema = z.object({
  sales_id: z.string().uuid().optional(),
  period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  business_id: z.string().uuid().optional(),
  status: commissionEntryStatusSchema.optional()
});

const recomputeSchema = z
  .object({
    billing_id: z.string().uuid().optional(),
    period: z.string().regex(/^\d{4}-\d{2}$/).optional()
  })
  .refine((value) => Boolean(value.billing_id || value.period), {
    message: "billing_id_or_period_required"
  });

const commissionSummaryQuerySchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/)
});

function serializeCommissionEntry(row: typeof commissionEntries.$inferSelect) {
  const effectiveAmountSgd = row.amountOverride ?? row.amountSgd;
  return {
    id: row.id,
    sales_id: row.salesId,
    billing_id: row.billingId,
    business_id: row.businessId,
    period: row.period,
    recurrence: row.recurrence,
    seq: row.seq,
    milestone_seq: row.milestoneSeq,
    amount_sgd: row.amountSgd,
    amount_override: row.amountOverride,
    effective_amount_sgd: effectiveAmountSgd,
    status: row.status,
    payslip_id: row.payslipId,
    source_line_id: row.sourceLineId,
    note: row.note,
    created_at: row.createdAt
  };
}

export async function registerCommissionRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/commission/entries", { preHandler: requirePerm("finance.view") }, async (request) => {
    const query = parseWithSchema(commissionEntriesQuerySchema, request.query);
    const filters: SQL[] = [];
    const companyIds = await getAccessibleCompanyIds(request);
    const accessFilter = companyFilter(companyIds, businesses.companyId);

    if (accessFilter) filters.push(accessFilter);

    if (query.sales_id) filters.push(eq(commissionEntries.salesId, query.sales_id));
    if (query.period) filters.push(eq(commissionEntries.period, query.period));
    if (query.business_id) filters.push(eq(commissionEntries.businessId, query.business_id));
    if (query.status) filters.push(eq(commissionEntries.status, query.status));

    const where = filters.length > 0 ? and(...filters) : sql`true`;
    const rows = await db
      .select({
        entry: commissionEntries,
        sales: {
          id: employees.id,
          name: employees.name,
          nameEn: employees.nameEn
        },
        business: {
          id: businesses.id,
          code: businesses.code,
          name: businesses.name,
          nameEn: businesses.nameEn
        }
      })
      .from(commissionEntries)
      .leftJoin(employees, eq(commissionEntries.salesId, employees.id))
      .leftJoin(businesses, eq(commissionEntries.businessId, businesses.id))
      .where(where)
      .orderBy(desc(commissionEntries.period), desc(commissionEntries.createdAt));

    const totals = await db
      .select({
        status: commissionEntries.status,
        total: sql<string>`coalesce(sum(coalesce(${commissionEntries.amountOverride}, ${commissionEntries.amountSgd})),0)`
      })
      .from(commissionEntries)
      .leftJoin(businesses, eq(commissionEntries.businessId, businesses.id))
      .where(where)
      .groupBy(commissionEntries.status);

    return {
      entries: rows.map((row) => ({
        ...serializeCommissionEntry(row.entry),
        sales: row.sales,
        business: row.business
      })),
      totals: totals.reduce<Record<string, string>>((acc, row) => {
        acc[row.status] = row.total;
        return acc;
      }, {})
    };
  });

  app.get("/commission/mine", { preHandler: requirePerm("commission.view_own") }, async (request) => {
    const rows = await db
      .select({
        entry: commissionEntries,
        billing: {
          id: billing.id
        },
        business: {
          id: businesses.id,
          code: businesses.code,
          name: businesses.name,
          nameEn: businesses.nameEn
        }
      })
      .from(commissionEntries)
      .leftJoin(billing, eq(commissionEntries.billingId, billing.id))
      .leftJoin(businesses, eq(commissionEntries.businessId, businesses.id))
      .where(eq(commissionEntries.salesId, request.user.id))
      .orderBy(desc(commissionEntries.period), desc(commissionEntries.createdAt));

    return {
      entries: rows.map((row) => ({
        billing_id: row.entry.billingId,
        business: row.business,
        period: row.entry.period,
        amount_sgd: row.entry.amountSgd,
        amount_override: row.entry.amountOverride,
        effective_amount_sgd: row.entry.amountOverride ?? row.entry.amountSgd,
        status: row.entry.status,
        payslip_id: row.entry.payslipId,
        recurrence: row.entry.recurrence,
        created_at: row.entry.createdAt
      }))
    };
  });

  app.post(
    "/commission/recompute",
    { preHandler: requirePerm("commission.manage") },
    async (request, reply) => {
      const body = parseWithSchema(recomputeSchema, request.body);

      const rows = body.billing_id
        ? await db.select().from(billing).where(eq(billing.id, body.billing_id)).limit(1)
        : await db
            .select()
            .from(billing)
            .where(sql`to_char(${billing.createdAt},'YYYY-MM') = ${body.period}`);

      if (body.billing_id && rows.length === 0) {
        return sendNotFound(reply);
      }

      const results = await db.transaction(async (tx) => {
        const generated = [];
        for (const row of rows) {
          generated.push({
            billing_id: row.id,
            ...(await generateCommissionEntries(row, tx))
          });
        }
        return generated;
      });

      return { recomputed: results.length, results };
    }
  );

  app.post(
    "/commission/entries",
    { preHandler: requirePerm("commission.manage") },
    async (request, reply) => {
      const body = parseWithSchema(commissionEntryCreateSchema, request.body);
      const [entry] = await db
        .insert(commissionEntries)
        .values({
          salesId: body.sales_id,
          billingId: body.billing_id,
          businessId: body.business_id,
          period: body.period,
          recurrence: body.recurrence,
          seq: 1,
          amountSgd: toNumeric(body.amount_sgd) ?? "0",
          status: "pending",
          note: body.note
        })
        .returning();

      if (!entry) {
        throw new Error("commission_entry_create_failed");
      }

      return reply.code(201).send({ entry: serializeCommissionEntry(entry) });
    }
  );

  app.patch(
    "/commission/entries/:id",
    { preHandler: requirePerm("commission.manage") },
    async (request, reply) => {
      const { id } = parseWithSchema(idParamsSchema, request.params);
      const body = parseWithSchema(commissionEntryUpdateSchema, request.body);
      const [current] = await db.select().from(commissionEntries).where(eq(commissionEntries.id, id)).limit(1);

      if (!current) {
        return sendNotFound(reply);
      }

      if ((body.amount_sgd !== undefined || body.period !== undefined) && current.status !== "pending") {
        return reply.code(409).send({ error: "commission_entry_not_pending" });
      }

      const [entry] = await db
        .update(commissionEntries)
        .set({
          amountSgd: body.amount_sgd === undefined ? undefined : String(body.amount_sgd),
          amountOverride: body.amount_override === undefined ? undefined : toNumeric(body.amount_override),
          period: body.period,
          status: body.status,
          payslipId: body.status === "void" ? null : undefined
        })
        .where(eq(commissionEntries.id, id))
        .returning();

      if (!entry) {
        return sendNotFound(reply);
      }

      return { entry: serializeCommissionEntry(entry) };
    }
  );

  app.get("/sales/:id/commission-summary", { preHandler: requirePerm("finance.view") }, async (request) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const query = parseWithSchema(commissionSummaryQuerySchema, request.query);
    const companyIds = await getAccessibleCompanyIds(request);
    const filters: SQL[] = [
      eq(commissionEntries.salesId, id),
      eq(commissionEntries.period, query.period),
      sql`${commissionEntries.status} <> 'void'`
    ];
    const accessFilter = companyFilter(companyIds, businesses.companyId);

    if (accessFilter) filters.push(accessFilter);

    const rows = await db
      .select({ entry: commissionEntries })
      .from(commissionEntries)
      .leftJoin(businesses, eq(commissionEntries.businessId, businesses.id))
      .where(and(...filters))
      .orderBy(desc(commissionEntries.createdAt));
    const entries = rows.map((row) => row.entry);
    const total = entries.reduce((sum, row) => sum + Number(row.amountOverride ?? row.amountSgd), 0);

    return {
      sales_id: id,
      period: query.period,
      total: total.toFixed(2),
      entries: entries.map(serializeCommissionEntry)
    };
  });
}
