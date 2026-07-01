import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const courseDesignTasks = pgTable("course_design_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  owner: text("owner").notNull().default("小雨"),
  status: text("status").notNull().default("todo"),
  deliverable: text("deliverable"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});
