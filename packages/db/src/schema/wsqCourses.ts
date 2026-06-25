import { date, integer, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { employees } from "./employees";

export const wsqCourses = pgTable("wsq_courses", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  nameEn: text("name_en"),
  content: text("content"),
  startDate: date("start_date"),
  duration: text("duration"),
  teacherId: uuid("teacher_id").references(() => employees.id, { onDelete: "set null" }),
  priceSgd: numeric("price_sgd", { precision: 12, scale: 2 }),
  minStudents: integer("min_students"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
