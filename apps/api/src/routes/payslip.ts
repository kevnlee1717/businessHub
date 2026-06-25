import {
  compensationTemplates,
  db,
  employeeCompensation,
  employees,
  payslips,
  performanceScores
} from "@bh/db";
import { payslipGenerateSchema } from "@bh/shared";
import { and, desc, eq, inArray } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { z } from "zod";
import { requirePerm } from "../auth/jwt";
import { parseWithSchema } from "./hrUtils";

const payslipQuerySchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  employee_id: z.string().uuid().optional()
});

function num(value: string | number | null | undefined): number {
  return value === null || value === undefined ? 0 : Number(value);
}

function money(value: number): string {
  return value.toFixed(2);
}

// 解析某员工生效薪酬:个人覆盖 ?? 公司×岗位模板
async function resolveCompensation(employee: typeof employees.$inferSelect) {
  const [employeeRow] = await db
    .select()
    .from(employeeCompensation)
    .where(eq(employeeCompensation.employeeId, employee.id))
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

  const pick = <K extends keyof typeof employeeCompensation.$inferSelect & keyof typeof compensationTemplates.$inferSelect>(
    field: K
  ) => employeeRow?.[field] ?? templateRow?.[field] ?? null;

  return {
    baseSalary: num(pick("baseSalary")),
    attendanceBonus: num(pick("attendanceBonus")),
    taskCompletionBonus: num(pick("taskCompletionBonus")),
    taskSatisfactionBonus: num(pick("taskSatisfactionBonus")),
    kpiBonus: num(pick("kpiBonus")),
    payday: (pick("payday") as number | null) ?? null,
    currency: (pick("salaryCurrency") as "SGD" | "RMB" | null) ?? employee.salaryCurrency
  };
}

// 按 spec §3.3 公式算一张工资条(draft);法定扣项留待缴款环节填,见 progress.md「已知简化」
async function buildPayslip(employee: typeof employees.$inferSelect, period: string) {
  const comp = await resolveCompensation(employee);
  const [perf] = await db
    .select()
    .from(performanceScores)
    .where(and(eq(performanceScores.employeeId, employee.id), eq(performanceScores.period, period)))
    .limit(1);

  const attendanceQualified = perf?.attendanceQualifiedOverride ?? perf?.attendanceQualifiedAuto ?? false;
  const completionPct = num(perf?.taskCompletionPctOverride ?? perf?.taskCompletionPctAuto);
  const satisfactionPct = num(perf?.taskSatisfactionPctOverride ?? perf?.taskSatisfactionPctAuto);
  const kpiPct = num(perf?.kpiPctOverride ?? perf?.kpiPctAuto);

  const attendanceBonusPaid = attendanceQualified ? comp.attendanceBonus : 0;
  const taskCompletionBonusPaid = comp.taskCompletionBonus * (completionPct / 100);
  const taskSatisfactionBonusPaid = comp.taskSatisfactionBonus * (satisfactionPct / 100);
  const kpiBonusPaid = comp.kpiBonus * (kpiPct / 100);
  const commissionTotal = 0; // 提成表尚未建模,见 progress.md

  const gross =
    comp.baseSalary +
    attendanceBonusPaid +
    taskCompletionBonusPaid +
    taskSatisfactionBonusPaid +
    kpiBonusPaid +
    commissionTotal;

  // 法定扣项暂留空 → net = gross
  const netPay = gross;

  return {
    employeeId: employee.id,
    period,
    payday: comp.payday,
    baseSalary: money(comp.baseSalary),
    attendanceBonusPaid: money(attendanceBonusPaid),
    taskCompletionBonusPaid: money(taskCompletionBonusPaid),
    taskSatisfactionBonusPaid: money(taskSatisfactionBonusPaid),
    kpiBonusPaid: money(kpiBonusPaid),
    commissionTotal: money(commissionTotal),
    gross: money(gross),
    netPay: money(netPay),
    currency: comp.currency,
    status: "draft" as const,
    updatedAt: new Date()
  };
}

export async function registerPayslipRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/payslips", { preHandler: requirePerm("payroll.view") }, async (request) => {
    const query = parseWithSchema(payslipQuerySchema, request.query);
    const filters = [];

    if (query.period) filters.push(eq(payslips.period, query.period));
    if (query.employee_id) filters.push(eq(payslips.employeeId, query.employee_id));

    const rows = await db
      .select()
      .from(payslips)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(payslips.period));

    return { payslips: rows };
  });

  app.post(
    "/payslips/generate",
    { preHandler: requirePerm("payroll.manage") },
    async (request, reply) => {
      const input = parseWithSchema(payslipGenerateSchema, request.body);

      const targets = input.employee_ids?.length
        ? await db.select().from(employees).where(inArray(employees.id, input.employee_ids))
        : await db.select().from(employees).where(eq(employees.status, "active"));

      const generated = [];
      for (const employee of targets) {
        const values = await buildPayslip(employee, input.period);
        const [payslip] = await db
          .insert(payslips)
          .values(values)
          .onConflictDoUpdate({
            target: [payslips.employeeId, payslips.period],
            set: values
          })
          .returning();

        generated.push(payslip);
      }

      return reply.code(201).send({ generated: generated.length, payslips: generated });
    }
  );
}
