import { integer, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { diplomaCourses } from "./diplomaCourses";
import { employees } from "./employees";

export const diplomaModules = pgTable("diploma_modules", {
  id: uuid("id").primaryKey().defaultRandom(),
  courseId: uuid("course_id").references(() => diplomaCourses.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  nameEn: text("name_en"),
  content: text("content"),
  teacherId: uuid("teacher_id").references(() => employees.id, { onDelete: "set null" }),
  priceSgd: numeric("price_sgd", { precision: 12, scale: 2 }),
  weeks: integer("weeks"),
  sortOrder: integer("sort_order"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
