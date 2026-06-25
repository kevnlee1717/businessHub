import {
  compensationTemplates,
  companies,
  db,
  employeeCompensation,
  employees,
  positions
} from "@bh/db";
import { compensationTemplateSchema, employeeCompensationSchema } from "@bh/shared";
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

const compensationTemplateUpdateSchema = compensationTemplateSchema.partial();

type CompensationSource = "employee" | "template" | "none";
type ResolvedCompensationField = {
  value: string | number | null;
  source: CompensationSource;
};

const compensationFieldNames = [
  "baseSalary",
  "salaryCurrency",
  "attendanceBonus",
  "taskCompletionBonus",
  "taskSatisfactionBonus",
  "kpiBonus",
  "defaultCommissionType",
  "defaultCommissionValue",
  "payday"
] as const;

const responseFieldNames = [
  "base_salary",
  "salary_currency",
  "attendance_bonus",
  "task_completion_bonus",
  "task_satisfaction_bonus",
  "kpi_bonus",
  "default_commission_type",
  "default_commission_value",
  "payday"
] as const;

type CompensationTemplateInput = ReturnType<typeof compensationTemplateSchema.parse>;
type CompensationTemplateUpdateInput = ReturnType<typeof compensationTemplateUpdateSchema.parse>;
type EmployeeCompensationInput = ReturnType<typeof employeeCompensationSchema.parse>;

function compensationCreateValues(input: CompensationTemplateInput): typeof compensationTemplates.$inferInsert {
  return {
    companyId: input.company_id,
    positionId: input.position_id,
    baseSalary: toNumeric(input.base_salary),
    salaryCurrency: input.salary_currency,
    attendanceBonus: toNumeric(input.attendance_bonus),
    taskCompletionBonus: toNumeric(input.task_completion_bonus),
    taskSatisfactionBonus: toNumeric(input.task_satisfaction_bonus),
    kpiBonus: toNumeric(input.kpi_bonus),
    defaultCommissionType: input.default_commission_type,
    defaultCommissionValue: toNumeric(input.default_commission_value),
    payday: input.payday,
    updatedAt: new Date()
  };
}

function compensationUpdateValues(input: CompensationTemplateUpdateInput): Partial<typeof compensationTemplates.$inferInsert> {
  const values: Partial<typeof compensationTemplates.$inferInsert> = {
    updatedAt: new Date()
  };

  if (input.company_id !== undefined) values.companyId = input.company_id;
  if (input.position_id !== undefined) values.positionId = input.position_id;
  if (input.base_salary !== undefined) values.baseSalary = toNumeric(input.base_salary);
  if (input.salary_currency !== undefined) values.salaryCurrency = input.salary_currency;
  if (input.attendance_bonus !== undefined) values.attendanceBonus = toNumeric(input.attendance_bonus);
  if (input.task_completion_bonus !== undefined) values.taskCompletionBonus = toNumeric(input.task_completion_bonus);
  if (input.task_satisfaction_bonus !== undefined) values.taskSatisfactionBonus = toNumeric(input.task_satisfaction_bonus);
  if (input.kpi_bonus !== undefined) values.kpiBonus = toNumeric(input.kpi_bonus);
  if (input.default_commission_type !== undefined) values.defaultCommissionType = input.default_commission_type;
  if (input.default_commission_value !== undefined) values.defaultCommissionValue = toNumeric(input.default_commission_value);
  if (input.payday !== undefined) values.payday = input.payday;

  return values;
}

function employeeCompensationValues(input: EmployeeCompensationInput): Partial<typeof employeeCompensation.$inferInsert> {
  const values: Partial<typeof employeeCompensation.$inferInsert> = {
    updatedAt: new Date()
  };

  if (input.base_salary !== undefined) values.baseSalary = toNumeric(input.base_salary);
  if (input.salary_currency !== undefined) values.salaryCurrency = input.salary_currency;
  if (input.attendance_bonus !== undefined) values.attendanceBonus = toNumeric(input.attendance_bonus);
  if (input.task_completion_bonus !== undefined) values.taskCompletionBonus = toNumeric(input.task_completion_bonus);
  if (input.task_satisfaction_bonus !== undefined) values.taskSatisfactionBonus = toNumeric(input.task_satisfaction_bonus);
  if (input.kpi_bonus !== undefined) values.kpiBonus = toNumeric(input.kpi_bonus);
  if (input.default_commission_type !== undefined) values.defaultCommissionType = input.default_commission_type;
  if (input.default_commission_value !== undefined) values.defaultCommissionValue = toNumeric(input.default_commission_value);
  if (input.payday !== undefined) values.payday = input.payday;

  return values;
}

export async function registerCompensationRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/compensation/templates", async () => {
    const templates = await db
      .select({
        id: compensationTemplates.id,
        company_id: compensationTemplates.companyId,
        company_name: companies.name,
        position_id: compensationTemplates.positionId,
        position_name: positions.name,
        base_salary: compensationTemplates.baseSalary,
        salary_currency: compensationTemplates.salaryCurrency,
        attendance_bonus: compensationTemplates.attendanceBonus,
        task_completion_bonus: compensationTemplates.taskCompletionBonus,
        task_satisfaction_bonus: compensationTemplates.taskSatisfactionBonus,
        kpi_bonus: compensationTemplates.kpiBonus,
        default_commission_type: compensationTemplates.defaultCommissionType,
        default_commission_value: compensationTemplates.defaultCommissionValue,
        payday: compensationTemplates.payday,
        created_at: compensationTemplates.createdAt,
        updated_at: compensationTemplates.updatedAt
      })
      .from(compensationTemplates)
      .leftJoin(companies, eq(compensationTemplates.companyId, companies.id))
      .leftJoin(positions, eq(compensationTemplates.positionId, positions.id));

    return { templates };
  });

  app.post(
    "/compensation/templates",
    { preHandler: requirePerm("payroll.manage") },
    async (request, reply) => {
      const input = parseWithSchema(compensationTemplateSchema, request.body);

      try {
        const [template] = await db
          .insert(compensationTemplates)
          .values(compensationCreateValues(input))
          .returning();

        return reply.code(201).send({ template });
      } catch (error) {
        if (isUniqueViolation(error)) {
          return sendConflict(reply, "compensation_template_exists");
        }

        throw error;
      }
    }
  );

  app.patch(
    "/compensation/templates/:id",
    { preHandler: requirePerm("payroll.manage") },
    async (request, reply) => {
      const params = parseWithSchema(idParamsSchema, request.params);
      const input = parseWithSchema(compensationTemplateUpdateSchema, request.body);

      try {
        const [template] = await db
          .update(compensationTemplates)
          .set(compensationUpdateValues(input))
          .where(eq(compensationTemplates.id, params.id))
          .returning();

        if (!template) {
          return sendNotFound(reply);
        }

        return { template };
      } catch (error) {
        if (isUniqueViolation(error)) {
          return sendConflict(reply, "compensation_template_exists");
        }

        throw error;
      }
    }
  );

  app.get("/employees/:id/compensation", async (request, reply) => {
    const params = parseWithSchema(idParamsSchema, request.params);
    const [row] = await db
      .select()
      .from(employeeCompensation)
      .where(eq(employeeCompensation.employeeId, params.id))
      .limit(1);

    return { compensation: row ?? null };
  });

  app.put(
    "/employees/:id/compensation",
    { preHandler: requirePerm("payroll.manage") },
    async (request, reply) => {
      const params = parseWithSchema(idParamsSchema, request.params);
      const input = parseWithSchema(employeeCompensationSchema, request.body);
      const [employee] = await db.select().from(employees).where(eq(employees.id, params.id)).limit(1);

      if (!employee) {
        return sendNotFound(reply);
      }

      const values = employeeCompensationValues(input);
      const [compensation] = await db
        .insert(employeeCompensation)
        .values({
          employeeId: params.id,
          ...values
        })
        .onConflictDoUpdate({
          target: employeeCompensation.employeeId,
          set: values
        })
        .returning();

      return { compensation };
    }
  );

  app.get("/employees/:id/compensation/resolved", async (request, reply) => {
    const params = parseWithSchema(idParamsSchema, request.params);
    const [employee] = await db.select().from(employees).where(eq(employees.id, params.id)).limit(1);

    if (!employee) {
      return sendNotFound(reply);
    }

    const [employeeRow] = await db
      .select()
      .from(employeeCompensation)
      .where(eq(employeeCompensation.employeeId, params.id))
      .limit(1);

    const [templateRow] =
      employee.companyId && employee.positionId
        ? await db
            .select()
            .from(compensationTemplates)
            .where(
              and(
                eq(compensationTemplates.companyId, employee.companyId),
                eq(compensationTemplates.positionId, employee.positionId)
              )
            )
            .limit(1)
        : [];

    const resolved = Object.fromEntries(
      compensationFieldNames.map((field, index) => {
        const responseName = responseFieldNames[index];
        const employeeValue = employeeRow?.[field] ?? null;
        const templateValue = templateRow?.[field] ?? null;
        let source: CompensationSource = "none";
        let value: string | number | null = null;

        if (employeeValue !== null) {
          source = "employee";
          value = employeeValue;
        } else if (templateValue !== null) {
          source = "template";
          value = templateValue;
        }

        return [responseName, { value, source } satisfies ResolvedCompensationField];
      })
    ) as Record<(typeof responseFieldNames)[number], ResolvedCompensationField>;

    return {
      employee_id: employee.id,
      template_id: templateRow?.id ?? null,
      compensation: resolved
    };
  });
}
