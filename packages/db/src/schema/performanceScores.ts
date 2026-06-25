import { boolean, numeric, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";
import { employees } from "./employees";

export const performanceScores = pgTable(
  "performance_scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    period: text("period").notNull(),
    attendanceQualifiedAuto: boolean("attendance_qualified_auto"),
    attendanceQualifiedOverride: boolean("attendance_qualified_override"),
    taskCompletionPctAuto: numeric("task_completion_pct_auto", { precision: 6, scale: 2 }),
    taskCompletionPctOverride: numeric("task_completion_pct_override", { precision: 6, scale: 2 }),
    taskSatisfactionPctAuto: numeric("task_satisfaction_pct_auto", { precision: 6, scale: 2 }),
    taskSatisfactionPctOverride: numeric("task_satisfaction_pct_override", { precision: 6, scale: 2 }),
    kpiPctAuto: numeric("kpi_pct_auto", { precision: 6, scale: 2 }),
    kpiPctOverride: numeric("kpi_pct_override", { precision: 6, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [unique("performance_scores_employee_period_unique").on(table.employeeId, table.period)]
);
