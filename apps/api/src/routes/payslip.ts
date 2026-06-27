import {
  commissionEntries,
  compensationTemplates,
  db,
  employeeCompensation,
  employees,
  payslips,
  performanceScores
} from "@bh/db";
import { payslipGenerateSchema } from "@bh/shared";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { z } from "zod";
import { requirePerm } from "../auth/jwt";
import type { DbExecutor } from "./financeUtils";
import { idParamsSchema, parseWithSchema, sendNotFound } from "./hrUtils";

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
async function resolveCompensation(employee: typeof employees.$inferSelect, tx: DbExecutor = db) {
  const [employeeRow] = await tx
    .select()
    .from(employeeCompensation)
    .where(eq(employeeCompensation.employeeId, employee.id))
    .limit(1);

  const [templateRow] =
    employee.companyId && employee.positionId
      ? await tx
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
async function buildPayslip(employee: typeof employees.$inferSelect, period: string, tx: DbExecutor = db) {
  const comp = await resolveCompensation(employee, tx);
  const [perf] = await tx
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
  // 提成以 commission_entries 台账为准, 支持一次性/月度展开与业务覆盖重算。
  const [commissionRow] = await tx
    .select({
      total: sql<string>`coalesce(sum(coalesce(${commissionEntries.amountOverride}, ${commissionEntries.amountSgd})),0)`
    })
    .from(commissionEntries)
    .where(
      and(
        eq(commissionEntries.salesId, employee.id),
        eq(commissionEntries.period, period),
        sql`${commissionEntries.status} <> 'void'`
      )
    );
  const commissionTotal = Number(commissionRow?.total ?? 0);

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
        const payslip = await db.transaction(async (tx) => {
          const [existing] = await tx
            .select({ id: payslips.id })
            .from(payslips)
            .where(and(eq(payslips.employeeId, employee.id), eq(payslips.period, input.period)))
            .limit(1);

          if (existing) {
            await tx
              .update(commissionEntries)
              .set({ status: "pending", payslipId: null })
              .where(eq(commissionEntries.payslipId, existing.id));
          }

          const values = await buildPayslip(employee, input.period, tx);
          const [upserted] = await tx
            .insert(payslips)
            .values(values)
            .onConflictDoUpdate({
              target: [payslips.employeeId, payslips.period],
              set: values
            })
            .returning();

          if (!upserted) {
            throw new Error("payslip_generate_failed");
          }

          await tx
            .update(commissionEntries)
            .set({ status: "settled", payslipId: upserted.id })
            .where(
              and(
                eq(commissionEntries.salesId, employee.id),
                eq(commissionEntries.period, input.period),
                sql`${commissionEntries.status} <> 'void'`
              )
            );

          return upserted;
        });

        generated.push(payslip);
      }

      return reply.code(201).send({ generated: generated.length, payslips: generated });
    }
  );

  app.post("/payslips/:id/pay", { preHandler: requirePerm("payroll.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [payslip] = await db.select().from(payslips).where(eq(payslips.id, id)).limit(1);

    if (!payslip) {
      return sendNotFound(reply);
    }

    if (payslip.status === "paid") {
      return reply.code(409).send({ error: "already_paid" });
    }

    const [paidPayslip] = await db
      .update(payslips)
      .set({
        status: "paid",
        paidAt: new Date(),
        paidBy: request.user.id,
        updatedAt: new Date()
      })
      .where(eq(payslips.id, id))
      .returning();

    return { payslip: paidPayslip };
  });
}
