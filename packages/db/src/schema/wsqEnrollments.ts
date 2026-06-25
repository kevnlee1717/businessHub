import { pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { billing } from "./billing";
import { students } from "./students";
import { wsqCourses } from "./wsqCourses";

export const wsqEnrollments = pgTable("wsq_enrollments", {
  id: uuid("id").primaryKey().defaultRandom(),
  studentId: uuid("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  courseId: uuid("course_id").notNull().references(() => wsqCourses.id, { onDelete: "cascade" }),
  billingId: uuid("billing_id").references(() => billing.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
