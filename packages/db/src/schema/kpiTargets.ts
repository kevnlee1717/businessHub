import { numeric, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";
import { employees } from "./employees";

export const kpiTargets = pgTable(
  "kpi_targets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    period: text("period").notNull(),
    metric: text("metric").notNull(),
    target: numeric("target", { precision: 12, scale: 2 }).notNull(),
    actual: numeric("actual", { precision: 12, scale: 2 }),
    achievementPct: numeric("achievement_pct", { precision: 6, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [unique("kpi_targets_employee_period_metric_unique").on(table.employeeId, table.period, table.metric)]
);
