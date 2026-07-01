import { integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const courseDesignItems = pgTable("course_design_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  section: text("section").notNull(),
  status: text("status").notNull().default("draft"),
  sortOrder: integer("sort_order").notNull().default(0),
  fields: jsonb("fields").notNull().default({}),
  imageKey: text("image_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});
