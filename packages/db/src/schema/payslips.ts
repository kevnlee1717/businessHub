import { integer, numeric, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";
import { currencyEnum, payslipStatusEnum } from "./enums";
import { employees } from "./employees";

export const payslips = pgTable(
  "payslips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    period: text("period").notNull(),
    payday: integer("payday"),
    baseSalary: numeric("base_salary", { precision: 12, scale: 2 }).notNull().default("0"),
    attendanceBonusPaid: numeric("attendance_bonus_paid", { precision: 12, scale: 2 }).notNull().default("0"),
    taskCompletionBonusPaid: numeric("task_completion_bonus_paid", { precision: 12, scale: 2 }).notNull().default("0"),
    taskSatisfactionBonusPaid: numeric("task_satisfaction_bonus_paid", { precision: 12, scale: 2 }).notNull().default("0"),
    kpiBonusPaid: numeric("kpi_bonus_paid", { precision: 12, scale: 2 }).notNull().default("0"),
    commissionTotal: numeric("commission_total", { precision: 12, scale: 2 }).notNull().default("0"),
    gross: numeric("gross", { precision: 12, scale: 2 }).notNull().default("0"),
    cpfEmployee: numeric("cpf_employee", { precision: 12, scale: 2 }),
    cpfEmployer: numeric("cpf_employer", { precision: 12, scale: 2 }),
    levy: numeric("levy", { precision: 12, scale: 2 }),
    chinaFund: numeric("china_fund", { precision: 12, scale: 2 }),
    otherDeductions: numeric("other_deductions", { precision: 12, scale: 2 }).notNull().default("0"),
    netPay: numeric("net_pay", { precision: 12, scale: 2 }).notNull().default("0"),
    currency: currencyEnum("currency").notNull().default("SGD"),
    status: payslipStatusEnum("status").notNull().default("draft"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    paidBy: uuid("paid_by").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [unique("payslips_employee_period_unique").on(table.employeeId, table.period)]
);
