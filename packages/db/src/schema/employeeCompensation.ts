import { integer, numeric, timestamp, uuid } from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";
import { employees } from "./employees";
import { commissionTypeEnum, currencyEnum } from "./enums";

export const employeeCompensation = pgTable("employee_compensation", {
  id: uuid("id").primaryKey().defaultRandom(),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }).unique(),
  baseSalary: numeric("base_salary", { precision: 12, scale: 2 }),
  salaryCurrency: currencyEnum("salary_currency"),
  attendanceBonus: numeric("attendance_bonus", { precision: 12, scale: 2 }),
  taskCompletionBonus: numeric("task_completion_bonus", { precision: 12, scale: 2 }),
  taskSatisfactionBonus: numeric("task_satisfaction_bonus", { precision: 12, scale: 2 }),
  kpiBonus: numeric("kpi_bonus", { precision: 12, scale: 2 }),
  defaultCommissionType: commissionTypeEnum("default_commission_type"),
  defaultCommissionValue: numeric("default_commission_value", { precision: 12, scale: 2 }),
  payday: integer("payday"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});
