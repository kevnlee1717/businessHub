import { pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { diplomaAssignmentStatusEnum } from "./enums";
import { diplomaCourses } from "./diplomaCourses";
import { diplomaEnrollments } from "./diplomaEnrollments";

export const diplomaAssignments = pgTable(
  "diploma_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    enrollmentId: uuid("enrollment_id").notNull().references(() => diplomaEnrollments.id, { onDelete: "cascade" }),
    courseId: uuid("course_id").references(() => diplomaCourses.id, { onDelete: "set null" }),
    status: diplomaAssignmentStatusEnum("status").notNull().default("pending"),
    passedAt: timestamp("passed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [unique("diploma_assignments_enrollment_course_unique").on(table.enrollmentId, table.courseId)]
);
