import { db, employees, kpiTargets } from "@bh/db";
import { kpiTargetSchema } from "@bh/shared";
import { and, eq } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { z } from "zod";
import { requirePerm } from "../auth/jwt";
import { idParamsSchema, parseWithSchema, sendNotFound, toNumeric } from "./hrUtils";

const kpiQuerySchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/).optional()
});

function achievementPct(target: number, actual: number | undefined): string | null {
  if (actual === undefined || target === 0) {
    return null;
  }

  return ((actual / target) * 100).toFixed(2);
}

export async function registerKpiRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/employees/:id/kpi", async (request) => {
    const params = parseWithSchema(idParamsSchema, request.params);
    const query = parseWithSchema(kpiQuerySchema, request.query);
    const filters = [eq(kpiTargets.employeeId, params.id)];

    if (query.period) {
      filters.push(eq(kpiTargets.period, query.period));
    }

    const targets = await db
      .select()
      .from(kpiTargets)
      .where(and(...filters));

    return { targets };
  });

  app.put(
    "/employees/:id/kpi",
    { preHandler: requirePerm("employee.manage") },
    async (request, reply) => {
      const params = parseWithSchema(idParamsSchema, request.params);
      const input = parseWithSchema(kpiTargetSchema, request.body);
      const [employee] = await db.select().from(employees).where(eq(employees.id, params.id)).limit(1);

      if (!employee) {
        return sendNotFound(reply);
      }

      const values = {
        employeeId: params.id,
        period: input.period,
        metric: input.metric,
        target: toNumeric(input.target) as string,
        actual: toNumeric(input.actual),
        achievementPct: achievementPct(input.target, input.actual)
      };

      const [target] = await db
        .insert(kpiTargets)
        .values(values)
        .onConflictDoUpdate({
          target: [kpiTargets.employeeId, kpiTargets.period, kpiTargets.metric],
          set: {
            target: values.target,
            actual: values.actual,
            achievementPct: values.achievementPct
          }
        })
        .returning();

      return { target };
    }
  );
}
