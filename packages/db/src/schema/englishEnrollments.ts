import { date, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { billing } from "./billing";
import { englishClasses } from "./englishClasses";
import { englishLevels } from "./englishLevels";
import { students } from "./students";

export const englishEnrollments = pgTable("english_enrollments", {
  id: uuid("id").primaryKey().defaultRandom(),
  studentId: uuid("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  classId: uuid("class_id").references(() => englishClasses.id, { onDelete: "set null" }),
  levelId: uuid("level_id").references(() => englishLevels.id, { onDelete: "set null" }),
  enrollDate: date("enroll_date"),
  billingId: uuid("billing_id").references(() => billing.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
