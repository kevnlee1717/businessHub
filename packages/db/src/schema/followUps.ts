import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { caseSteps } from "./caseSteps";
import { employees } from "./employees";

export const followUps = pgTable("follow_ups", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseStepId: uuid("case_step_id").notNull().references(() => caseSteps.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").references(() => employees.id, { onDelete: "set null" }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
