import { db, employees, performanceScores } from "@bh/db";
import { performanceOverrideSchema } from "@bh/shared";
import { and, count, desc, eq } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { z } from "zod";
import { requirePerm } from "../auth/jwt";
import { getPagination, paginationQuery } from "../lib/pagination";
import { idParamsSchema, parseWithSchema, sendNotFound, toNumeric } from "./hrUtils";

const performanceQuerySchema = z
  .object({
    period: z.string().regex(/^\d{4}-\d{2}$/).optional()
  })
  .merge(paginationQuery);

// 最终取值:override ?? auto(spec §3.3)
function effective(row: typeof performanceScores.$inferSelect) {
  return {
    attendance_qualified: row.attendanceQualifiedOverride ?? row.attendanceQualifiedAuto,
    task_completion_pct: row.taskCompletionPctOverride ?? row.taskCompletionPctAuto,
    task_satisfaction_pct: row.taskSatisfactionPctOverride ?? row.taskSatisfactionPctAuto,
    kpi_pct: row.kpiPctOverride ?? row.kpiPctAuto
  };
}

export async function registerPerformanceRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/employees/:id/performance", async (request) => {
    const params = parseWithSchema(idParamsSchema, request.params);
    const query = parseWithSchema(performanceQuerySchema, request.query);
    const filters = [eq(performanceScores.employeeId, params.id)];

    if (query.period) {
      filters.push(eq(performanceScores.period, query.period));
    }

    const where = and(...filters);
    const pagination = getPagination(query);
    const rows = pagination.paginate
      ? await db
          .select()
          .from(performanceScores)
          .where(where)
          .orderBy(desc(performanceScores.period))
          .limit(pagination.limit)
          .offset(pagination.offset)
      : await db.select().from(performanceScores).where(where).orderBy(desc(performanceScores.period));

    if (!pagination.paginate) {
      return { scores: rows.map((row) => ({ ...row, effective: effective(row) })) };
    }

    const [totalRow] = await db.select({ total: count() }).from(performanceScores).where(where);

    return {
      scores: rows.map((row) => ({ ...row, effective: effective(row) })),
      total: totalRow?.total ?? 0,
      page: pagination.page,
      page_size: pagination.pageSize
    };
  });

  app.put(
    "/employees/:id/performance",
    { preHandler: requirePerm("employee.manage") },
    async (request, reply) => {
      const params = parseWithSchema(idParamsSchema, request.params);
      const input = parseWithSchema(performanceOverrideSchema, request.body);
      const [employee] = await db.select().from(employees).where(eq(employees.id, params.id)).limit(1);

      if (!employee) {
        return sendNotFound(reply);
      }

      const overrides = {
        attendanceQualifiedOverride: input.attendance_qualified ?? null,
        taskCompletionPctOverride: toNumeric(input.task_completion_pct) ?? null,
        taskSatisfactionPctOverride: toNumeric(input.task_satisfaction_pct) ?? null,
        kpiPctOverride: toNumeric(input.kpi_pct) ?? null,
        updatedAt: new Date()
      };

      const [score] = await db
        .insert(performanceScores)
        .values({ employeeId: params.id, period: input.period, ...overrides })
        .onConflictDoUpdate({
          target: [performanceScores.employeeId, performanceScores.period],
          set: overrides
        })
        .returning();

      if (!score) {
        return reply.code(500).send({ error: "upsert_failed" });
      }

      return { score: { ...score, effective: effective(score) } };
    }
  );
}
