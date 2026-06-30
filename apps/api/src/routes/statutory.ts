import { db, statutoryPayments } from "@bh/db";
import { statutoryPaymentSchema, statutoryTypes } from "@bh/shared";
import { and, count, desc, eq, type SQL, sql } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { z } from "zod";
import { requirePerm } from "../auth/jwt";
import { getPagination, paginationQuery } from "../lib/pagination";
import { parseWithSchema, toNumeric } from "./hrUtils";

const statutoryQuerySchema = z
  .object({
    period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
    type: z.enum(statutoryTypes).optional(),
    employee_id: z.string().uuid().optional()
  })
  .merge(paginationQuery);

export async function registerStatutoryRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/statutory", { preHandler: requirePerm("payroll.view") }, async (request) => {
    const query = parseWithSchema(statutoryQuerySchema, request.query);
    const filters: SQL[] = [];

    if (query.period) filters.push(eq(statutoryPayments.period, query.period));
    if (query.type) filters.push(eq(statutoryPayments.type, query.type));
    if (query.employee_id) filters.push(eq(statutoryPayments.employeeId, query.employee_id));

    const where = filters.length > 0 ? and(...filters) : sql`true`;
    const pagination = getPagination(query);
    const payments = pagination.paginate
      ? await db
          .select()
          .from(statutoryPayments)
          .where(where)
          .orderBy(desc(statutoryPayments.period))
          .limit(pagination.limit)
          .offset(pagination.offset)
      : await db.select().from(statutoryPayments).where(where).orderBy(desc(statutoryPayments.period));

    if (!pagination.paginate) {
      return { payments };
    }

    const [totalRow] = await db.select({ total: count() }).from(statutoryPayments).where(where);

    return {
      payments,
      total: totalRow?.total ?? 0,
      page: pagination.page,
      page_size: pagination.pageSize
    };
  });

  app.post("/statutory", { preHandler: requirePerm("payroll.edit") }, async (request, reply) => {
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
