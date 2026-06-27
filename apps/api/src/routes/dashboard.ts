import { type FastifyInstance } from "fastify";
import { z } from "zod";
import { requirePerm } from "../auth/jwt";
import { parseWithSchema } from "./hrUtils";
import {
  buildDashboardOverview,
  buildKpi,
  buildPaymentCalendar,
  buildReceivables,
  buildWhatIf,
  currentSgtPeriod
} from "./dashboardUtils";

const periodSchema = z.string().regex(/^\d{4}-\d{2}$/);

const periodQuerySchema = z.object({
  period: periodSchema.optional()
});

const companyPeriodQuerySchema = z.object({
  company_id: z.string().uuid().optional(),
  period: periodSchema.optional()
});

const receivablesQuerySchema = z.object({
  company_id: z.string().uuid().optional()
});

const whatIfSchema = z.object({
  company_id: z.string().uuid(),
  items: z
    .array(
      z.object({
        business_id: z.string().uuid(),
        count: z.number().int().min(0)
      })
    )
    .default([])
});

export async function registerDashboardRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/dashboard/overview", { preHandler: requirePerm("finance.view") }, async (request) => {
    const query = parseWithSchema(periodQuerySchema, request.query);
    return buildDashboardOverview(query.period);
  });

  app.get("/dashboard/payment-calendar", { preHandler: requirePerm("finance.view") }, async (request) => {
    const query = parseWithSchema(companyPeriodQuerySchema, request.query);
    return buildPaymentCalendar(query.period, query.company_id);
  });

  app.get("/dashboard/receivables", { preHandler: requirePerm("finance.view") }, async (request) => {
    const query = parseWithSchema(receivablesQuerySchema, request.query);
    return buildReceivables(query.company_id, currentSgtPeriod());
  });

  app.get("/dashboard/kpi", { preHandler: requirePerm("finance.view") }, async (request) => {
    const query = parseWithSchema(companyPeriodQuerySchema, request.query);
    return buildKpi(query.period, query.company_id);
  });

  app.post("/dashboard/whatif", { preHandler: requirePerm("finance.view") }, async (request) => {
    const body = parseWithSchema(whatIfSchema, request.body);
    return buildWhatIf(body.company_id, body.items ?? []);
  });
}
