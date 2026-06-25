import { integer, numeric, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { commissionTypeEnum, currencyEnum } from "./enums";
import { positions } from "./positions";

export const compensationTemplates = pgTable(
  "compensation_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    positionId: uuid("position_id").notNull().references(() => positions.id, { onDelete: "cascade" }),
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
  },
  (table) => [unique("compensation_templates_company_position_unique").on(table.companyId, table.positionId)]
);
