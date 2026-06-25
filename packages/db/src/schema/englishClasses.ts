import { date, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { employees } from "./employees";
import { englishLevels } from "./englishLevels";

export const englishClasses = pgTable("english_classes", {
  id: uuid("id").primaryKey().defaultRandom(),
  levelId: uuid("level_id").references(() => englishLevels.id, { onDelete: "set null" }),
  teacherId: uuid("teacher_id").references(() => employees.id, { onDelete: "set null" }),
  schedule: text("schedule"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
