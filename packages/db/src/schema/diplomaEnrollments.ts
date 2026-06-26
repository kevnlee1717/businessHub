import { boolean, date, integer, pgTable, timestamp, text, uuid } from "drizzle-orm/pg-core";
import { billing } from "./billing";
import { diplomaCourses } from "./diplomaCourses";
import { students } from "./students";

export const diplomaEnrollments = pgTable("diploma_enrollments", {
  id: uuid("id").primaryKey().defaultRandom(),
  studentId: uuid("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  courseId: uuid("course_id").references(() => diplomaCourses.id, { onDelete: "set null" }),
  program: text("program").notNull(),
  enrollDate: date("enroll_date"),
  billingId: uuid("billing_id").references(() => billing.id, { onDelete: "set null" }),
  installmentsCount: integer("installments_count"),
  graduated: boolean("graduated").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
