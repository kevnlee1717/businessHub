import { db, statutoryPayments } from "@bh/db";
import { statutoryPaymentSchema, statutoryTypes } from "@bh/shared";
import { and, desc, eq, type SQL, sql } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { z } from "zod";
import { requirePerm } from "../auth/jwt";
import { parseWithSchema, toNumeric } from "./hrUtils";

const statutoryQuerySchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  type: z.enum(statutoryTypes).optional(),
  employee_id: z.string().uuid().optional()
});

export async function registerStatutoryRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/statutory", { preHandler: requirePerm("payroll.view") }, async (request) => {
    const query = parseWithSchema(statutoryQuerySchema, request.query);
    const filters: SQL[] = [];

    if (query.period) filters.push(eq(statutoryPayments.period, query.period));
    if (query.type) filters.push(eq(statutoryPayments.type, query.type));
    if (query.employee_id) filters.push(eq(statutoryPayments.employeeId, query.employee_id));

    const payments = await db
      .select()
      .from(statutoryPayments)
      .where(filters.length > 0 ? and(...filters) : sql`true`)
      .orderBy(desc(statutoryPayments.period));

    return { payments };
  });

  app.post("/statutory", { preHandler: requirePerm("payroll.manage") }, async (request, reply) => {
    const input = parseWithSchema(statutoryPaymentSchema, request.body);

    const [payment] = await db
      .insert(statutoryPayments)
      .values({
        type: input.type,
        period: input.period,
        employeeId: input.employee_id ?? null,
        amount: toNumeric(input.amount) as string,
        paidAt: input.paid_at ? new Date(input.paid_at) : null,
        reference: input.reference
      })
      .returning();

    return reply.code(201).send({ payment });
  });
}
