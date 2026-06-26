import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { diplomaAssignments } from "./diplomaAssignments";
import { employees } from "./employees";
import { diplomaAssignmentActionEnum } from "./enums";

export const diplomaAssignmentMessages = pgTable("diploma_assignment_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  assignmentId: uuid("assignment_id").notNull().references(() => diplomaAssignments.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").references(() => employees.id, { onDelete: "set null" }),
  action: diplomaAssignmentActionEnum("action").notNull(),
  content: text("content"),
  documentIds: uuid("document_ids").array().notNull().default(sql`ARRAY[]::uuid[]`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
