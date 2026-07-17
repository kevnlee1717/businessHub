import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { caseSteps } from "./caseSteps";
import { employees } from "./employees";

export const caseStepDateLogs = pgTable("case_step_date_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseStepId: uuid("case_step_id").notNull().references(() => caseSteps.id, { onDelete: "cascade" }),
  actorId: uuid("actor_id").references(() => employees.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  oldCompletedAt: timestamp("old_completed_at", { withTimezone: true }),
  newCompletedAt: timestamp("new_completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
