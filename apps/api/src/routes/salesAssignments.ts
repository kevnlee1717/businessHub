import { businesses, db, employees, salesBusinessAssignments } from "@bh/db";
import {
  salesAssignmentCreateSchema,
  salesAssignmentUpdateSchema
} from "@bh/shared";
import { and, eq } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { requirePerm } from "../auth/jwt";
import {
  idParamsSchema,
  isUniqueViolation,
  parseWithSchema,
  sendConflict,
  sendNotFound,
  toNumeric
} from "./hrUtils";

function serializeAssignment(row: typeof salesBusinessAssignments.$inferSelect) {
  return {
    id: row.id,
    sales_id: row.salesId,
    business_id: row.businessId,
    commission_type: row.commissionType,
    commission_value: row.commissionValue,
    active: row.active,
    note: row.note,
    created_at: row.createdAt
  };
}

export async function registerSalesAssignmentRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/sales/:id/businesses", { preHandler: requirePerm("finance.view") }, async (request) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const rows = await db
      .select({
        assignment: salesBusinessAssignments,
        business: businesses
      })
      .from(salesBusinessAssignments)
      .innerJoin(businesses, eq(salesBusinessAssignments.businessId, businesses.id))
      .where(eq(salesBusinessAssignments.salesId, id))
      .orderBy(businesses.sortOrder, businesses.createdAt);

    return {
      assignments: rows.map((row) => ({
        ...serializeAssignment(row.assignment),
        business: row.business
      }))
    };
  });

  app.get("/businesses/:id/sales", { preHandler: requirePerm("finance.view") }, async (request) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const rows = await db
      .select({
        assignment: salesBusinessAssignments,
        sales: employees
      })
      .from(salesBusinessAssignments)
      .innerJoin(employees, eq(salesBusinessAssignments.salesId, employees.id))
      .where(eq(salesBusinessAssignments.businessId, id))
      .orderBy(employees.name);

    return {
      assignments: rows.map((row) => ({
        ...serializeAssignment(row.assignment),
        sales: row.sales
      }))
    };
  });

  app.post(
    "/sales-business-assignments",
    { preHandler: requirePerm("commission.manage") },
    async (request, reply) => {
      const body = parseWithSchema(salesAssignmentCreateSchema, request.body);
      const [sales] = await db
        .select({ id: employees.id, role: employees.role })
        .from(employees)
        .where(eq(employees.id, body.sales_id))
        .limit(1);

      if (!sales) {
        return reply.code(400).send({ error: "sales_not_found" });
      }
      if (sales.role !== "sales") {
        return reply.code(400).send({ error: "employee_not_sales" });
      }

      try {
        const [assignment] = await db
          .insert(salesBusinessAssignments)
          .values({
            salesId: body.sales_id,
            businessId: body.business_id,
            commissionType: body.commission_type,
            commissionValue: toNumeric(body.commission_value),
            active: body.active,
            note: body.note
          })
          .returning();

        if (!assignment) {
          throw new Error("sales_assignment_create_failed");
        }

        return reply.code(201).send({ assignment: serializeAssignment(assignment) });
      } catch (error) {
        if (isUniqueViolation(error)) {
          return sendConflict(reply, "sales_business_assignment_exists");
        }
        throw error;
      }
    }
  );

  app.patch("/sales-business-assignments/:id", { preHandler: requirePerm("commission.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(salesAssignmentUpdateSchema, request.body);

    if (body.sales_id) {
      const [sales] = await db
        .select({ role: employees.role })
        .from(employees)
        .where(eq(employees.id, body.sales_id))
        .limit(1);
      if (!sales) {
        return reply.code(400).send({ error: "sales_not_found" });
      }
      if (sales.role !== "sales") {
        return reply.code(400).send({ error: "employee_not_sales" });
      }
    }

    try {
      const [assignment] = await db
        .update(salesBusinessAssignments)
        .set({
          salesId: body.sales_id,
          businessId: body.business_id,
          commissionType: body.commission_type,
          commissionValue: toNumeric(body.commission_value),
          active: body.active,
          note: body.note
        })
        .where(eq(salesBusinessAssignments.id, id))
        .returning();

      if (!assignment) {
        return sendNotFound(reply);
      }

      return { assignment: serializeAssignment(assignment) };
    } catch (error) {
      if (isUniqueViolation(error)) {
        return sendConflict(reply, "sales_business_assignment_exists");
      }
      throw error;
    }
  });

  app.delete("/sales-business-assignments/:id", { preHandler: requirePerm("commission.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [assignment] = await db
      .delete(salesBusinessAssignments)
      .where(eq(salesBusinessAssignments.id, id))
      .returning();

    if (!assignment) {
      return sendNotFound(reply);
    }

    return { ok: true };
  });
}
