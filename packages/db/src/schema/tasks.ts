import { boolean, date, integer, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";
import { taskPriorityEnum, taskStatusEnum } from "./enums";
import { employees } from "./employees";

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description"),
  assigneeId: uuid("assignee_id").references(() => employees.id, { onDelete: "set null" }),
  creatorId: uuid("creator_id").references(() => employees.id, { onDelete: "set null" }),
  dueDate: date("due_date"),
  status: taskStatusEnum("status").notNull().default("todo"),
  priority: taskPriorityEnum("priority").notNull().default("normal"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  onTime: boolean("on_time"),
  satisfactionRating: integer("satisfaction_rating"),
  ratedBy: uuid("rated_by").references(() => employees.id, { onDelete: "set null" }),
  ratedAt: timestamp("rated_at", { withTimezone: true }),
  refType: text("ref_type"),
  refId: uuid("ref_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});
