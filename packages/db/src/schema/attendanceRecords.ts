import { boolean, date, integer, numeric, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";
import { attendanceKindEnum } from "./enums";
import { employees } from "./employees";

export const attendanceRecords = pgTable(
  "attendance_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    workDate: date("work_date").notNull(),
    kind: attendanceKindEnum("kind").notNull(),
    clockedAt: timestamp("clocked_at", { withTimezone: true }).notNull().defaultNow(),
    clockPointId: uuid("clock_point_id"),
    lat: numeric("lat", { precision: 10, scale: 7 }),
    lng: numeric("lng", { precision: 10, scale: 7 }),
    distanceM: numeric("distance_m", { precision: 10, scale: 2 }),
    inGeofence: boolean("in_geofence"),
    faceChallengeId: uuid("face_challenge_id"),
    facePass: boolean("face_pass"),
    faceSimilarity: numeric("face_similarity", { precision: 6, scale: 4 }),
    deviationMinutes: integer("deviation_minutes"),
    reason: text("reason"),
    method: text("method"),
    onBehalfUserId: uuid("on_behalf_user_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [unique("attendance_records_employee_date_kind_unique").on(table.employeeId, table.workDate, table.kind)]
);
