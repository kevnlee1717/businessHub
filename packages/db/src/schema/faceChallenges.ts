import { boolean, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { faceChallengeStatusEnum, facePurposeEnum } from "./enums";
import { employees } from "./employees";
import { faceBaselines } from "./faceBaselines";

export const faceChallenges = pgTable("face_challenges", {
  id: uuid("id").primaryKey().defaultRandom(),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  purpose: facePurposeEnum("purpose").notNull(),
  status: faceChallengeStatusEnum("status").notNull(),
  nonce: text("nonce"),
  similarity: numeric("similarity", { precision: 6, scale: 4 }),
  livenessActionPassed: boolean("liveness_action_passed"),
  livenessColorScore: numeric("liveness_color_score", { precision: 6, scale: 4 }),
  baselineId: uuid("baseline_id").references(() => faceBaselines.id, { onDelete: "set null" }),
  failureReason: text("failure_reason"),
  relatedAttendanceId: uuid("related_attendance_id"),
  relatedSiteVisitId: uuid("related_site_visit_id"),
  clientIp: text("client_ip"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});
