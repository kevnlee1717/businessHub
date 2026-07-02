import { boolean, date, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { diplomaCourses } from "./diplomaCourses";
import { diplomaModules } from "./diplomaModules";

export const diplomaIntakes = pgTable("diploma_intakes", {
  id: uuid("id").primaryKey().defaultRandom(),
  courseId: uuid("course_id").references(() => diplomaCourses.id, { onDelete: "cascade" }),
  moduleId: uuid("module_id").references(() => diplomaModules.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  startDate: date("start_date"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
