import { integer, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { diplomaPrograms } from "./diplomaPrograms";
import { employees } from "./employees";

export const diplomaCourses = pgTable("diploma_courses", {
  id: uuid("id").primaryKey().defaultRandom(),
  programId: uuid("program_id").references(() => diplomaPrograms.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  nameEn: text("name_en"),
  content: text("content"),
  teacherId: uuid("teacher_id").references(() => employees.id, { onDelete: "set null" }),
  priceSgd: numeric("price_sgd", { precision: 12, scale: 2 }),
  duration: text("duration"),
  monthIndex: integer("month_index"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
