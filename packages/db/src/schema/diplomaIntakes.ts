import { boolean, date, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { diplomaCourses } from "./diplomaCourses";

export const diplomaIntakes = pgTable("diploma_intakes", {
  id: uuid("id").primaryKey().defaultRandom(),
  courseId: uuid("course_id")
    .notNull()
    .references(() => diplomaCourses.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  startDate: date("start_date"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
