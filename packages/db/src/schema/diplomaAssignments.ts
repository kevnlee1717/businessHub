import { pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { diplomaAssignmentStatusEnum } from "./enums";
import { diplomaEnrollments } from "./diplomaEnrollments";
import { diplomaModules } from "./diplomaModules";

export const diplomaAssignments = pgTable(
  "diploma_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    enrollmentId: uuid("enrollment_id").notNull().references(() => diplomaEnrollments.id, { onDelete: "cascade" }),
    moduleId: uuid("module_id").references(() => diplomaModules.id, { onDelete: "set null" }),
    status: diplomaAssignmentStatusEnum("status").notNull().default("pending"),
    passedAt: timestamp("passed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [unique("diploma_assignments_enrollment_course_unique").on(table.enrollmentId, table.moduleId)]
);
