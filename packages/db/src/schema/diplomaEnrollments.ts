import { sql } from "drizzle-orm";
import { boolean, date, integer, numeric, pgTable, timestamp, text, uuid } from "drizzle-orm/pg-core";
import { billing } from "./billing";
import { diplomaCourses } from "./diplomaCourses";
import { documents } from "./documents";
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
  startPeriod: text("start_period"),
  depositPaidAt: timestamp("deposit_paid_at", { withTimezone: true }),
  depositAmount: numeric("deposit_amount", { precision: 12, scale: 2 }),
  certificateDocumentId: uuid("certificate_document_id").references(() => documents.id, { onDelete: "set null" }),
  mediaDocumentIds: uuid("media_document_ids").array().notNull().default(sql`ARRAY[]::uuid[]`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
