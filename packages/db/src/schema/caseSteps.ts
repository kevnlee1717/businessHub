import { sql } from "drizzle-orm";
import { integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { cases } from "./cases";
import { employees } from "./employees";
import { caseStepStatusEnum, stepReviewStatusEnum } from "./enums";

export const caseSteps = pgTable("case_steps", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
  stepOrder: integer("step_order").notNull(),
  name: text("name").notNull(),
  nameEn: text("name_en"),
  description: text("description"),
  assigneeId: uuid("assignee_id").references(() => employees.id, { onDelete: "set null" }),
  status: caseStepStatusEnum("status").notNull().default("pending"),
  reviewerId: uuid("reviewer_id").references(() => employees.id, { onDelete: "set null" }),
  reviewStatus: stepReviewStatusEnum("review_status").notNull().default("none"),
  meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  collections: jsonb("collections").$type<{
    collection_item_id: string;
    required?: boolean;
  }[]>().notNull().default(sql`'[]'::jsonb`),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
