import { db, employees } from "@bh/db";
import { employeeCreateSchema, employeeStatuses, employeeUpdateSchema, roles } from "@bh/shared";
import bcrypt from "bcryptjs";
import { and, eq, type SQL } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { z } from "zod";
import { requirePerm } from "../auth/jwt";
import { idParamsSchema, isUniqueViolation, parseWithSchema, sendConflict, sendNotFound } from "./hrUtils";

const employeeListQuerySchema = z.object({
  status: z.enum(employeeStatuses).optional(),
  role: z.enum(roles).optional(),
  company_id: z.string().uuid().optional()
});

function publicEmployee(employee: typeof employees.$inferSelect) {
  return {
    id: employee.id,
    name: employee.name,
    name_en: employee.nameEn,
    email: employee.email,
    phone: employee.phone,
    role: employee.role,
    company_id: employee.companyId,
    position_id: employee.positionId,
    shift_id: employee.shiftId,
    employment_type: employee.employmentType,
    status: employee.status,
    join_date: employee.joinDate,
    payroll_scheme: employee.payrollScheme,
    salary_currency: employee.salaryCurrency,
    gps_tracking_enabled: employee.gpsTrackingEnabled,
    created_at: employee.createdAt,
    updated_at: employee.updatedAt
  };
}

export async function registerEmployeeRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/employees", async (request) => {
    const query = parseWithSchema(employeeListQuerySchema, request.query);
    const conditions: SQL[] = [];

    if (query.status) {
      conditions.push(eq(employees.status, query.status));
    }

    if (query.role) {
      conditions.push(eq(employees.role, query.role));
    }

    if (query.company_id) {
      conditions.push(eq(employees.companyId, query.company_id));
    }

    const rows =
      conditions.length > 0
        ? await db.select().from(employees).where(and(...conditions)).orderBy(employees.createdAt)
        : await db.select().from(employees).orderBy(employees.createdAt);

    return { employees: rows.map(publicEmployee) };
  });

  app.get("/employees/:id", async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [employee] = await db.select().from(employees).where(eq(employees.id, id)).limit(1);

    if (!employee) {
      return sendNotFound(reply);
    }

    return { employee: publicEmployee(employee) };
  });

  app.post("/employees", { preHandler: requirePerm("employee.manage") }, async (request, reply) => {
    const body = parseWithSchema(employeeCreateSchema, request.body);
    const passwordHash = await bcrypt.hash(body.password, 10);

    try {
      const [employee] = await db
        .insert(employees)
        .values({
          name: body.name,
          nameEn: body.name_en,
          email: body.email,
          phone: body.phone,
          passwordHash,
          role: body.role,
          companyId: body.company_id,
          positionId: body.position_id,
          shiftId: body.shift_id,
          employmentType: body.employment_type,
          status: body.status,
          joinDate: body.join_date,
          payrollScheme: body.payroll_scheme,
          salaryCurrency: body.salary_currency,
          gpsTrackingEnabled: body.gps_tracking_enabled
        })
        .returning();

      if (!employee) {
        throw new Error("employee_create_failed");
      }

      return reply.code(201).send({ employee: publicEmployee(employee) });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return sendConflict(reply, "email_exists");
      }

      throw error;
    }
  });

  app.patch("/employees/:id", { preHandler: requirePerm("employee.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(employeeUpdateSchema, request.body);
    const update: Partial<typeof employees.$inferInsert> = {
      updatedAt: new Date()
    };

    if (body.name !== undefined) update.name = body.name;
    if (body.name_en !== undefined) update.nameEn = body.name_en;
    if (body.email !== undefined) update.email = body.email;
    if (body.phone !== undefined) update.phone = body.phone;
    if (body.role !== undefined) update.role = body.role;
    if (body.company_id !== undefined) update.companyId = body.company_id;
    if (body.position_id !== undefined) update.positionId = body.position_id;
    if (body.shift_id !== undefined) update.shiftId = body.shift_id;
    if (body.employment_type !== undefined) update.employmentType = body.employment_type;
    if (body.status !== undefined) update.status = body.status;
    if (body.join_date !== undefined) update.joinDate = body.join_date;
    if (body.payroll_scheme !== undefined) update.payrollScheme = body.payroll_scheme;
    if (body.salary_currency !== undefined) update.salaryCurrency = body.salary_currency;
    if (body.gps_tracking_enabled !== undefined) update.gpsTrackingEnabled = body.gps_tracking_enabled;
    if (body.password !== undefined) update.passwordHash = await bcrypt.hash(body.password, 10);

    try {
      const [employee] = await db.update(employees).set(update).where(eq(employees.id, id)).returning();

      if (!employee) {
        return sendNotFound(reply);
      }

      return { employee: publicEmployee(employee) };
    } catch (error) {
      if (isUniqueViolation(error)) {
        return sendConflict(reply, "email_exists");
      }

      throw error;
    }
  });
}
