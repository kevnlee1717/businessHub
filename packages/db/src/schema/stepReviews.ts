import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { caseSteps } from "./caseSteps";
import { employees } from "./employees";
import { stepReviewActionEnum } from "./enums";

export const stepReviews = pgTable("step_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseStepId: uuid("case_step_id").notNull().references(() => caseSteps.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").references(() => employees.id, { onDelete: "set null" }),
  action: stepReviewActionEnum("action").notNull(),
  content: text("content"),
  documentIds: uuid("document_ids").array().notNull().default(sql`ARRAY[]::uuid[]`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
