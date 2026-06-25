import { sql } from "drizzle-orm";
import { numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { siteVisitFaceStatusEnum, siteVisitStatusEnum } from "./enums";
import { documents } from "./documents";
import { employees } from "./employees";

export const siteVisits = pgTable("site_visits", {
  id: uuid("id").primaryKey().defaultRandom(),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  clientId: uuid("client_id"),
  capturedAt: timestamp("captured_at", { withTimezone: true }),
  syncedAt: timestamp("synced_at", { withTimezone: true }),
  lat: numeric("lat", { precision: 10, scale: 7 }),
  lng: numeric("lng", { precision: 10, scale: 7 }),
  accuracy: numeric("accuracy", { precision: 10, scale: 2 }),
  address: text("address"),
  selfieDocumentId: uuid("selfie_document_id").references(() => documents.id, { onDelete: "set null" }),
  sitePhotoDocumentIds: uuid("site_photo_document_ids").array().notNull().default(sql`ARRAY[]::uuid[]`),
  faceChallengeId: uuid("face_challenge_id"),
  faceStatus: siteVisitFaceStatusEnum("face_status"),
  faceSimilarity: numeric("face_similarity", { precision: 6, scale: 4 }),
  distanceToLeadM: numeric("distance_to_lead_m", { precision: 10, scale: 2 }),
  note: text("note"),
  status: siteVisitStatusEnum("status").notNull().default("pending"),
  rejectReason: text("reject_reason"),
  overriddenBy: uuid("overridden_by").references(() => employees.id, { onDelete: "set null" }),
  overriddenAt: timestamp("overridden_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
