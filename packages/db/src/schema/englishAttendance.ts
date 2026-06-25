import { boolean, date, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { englishEnrollments } from "./englishEnrollments";

export const englishAttendance = pgTable(
  "english_attendance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    enrollmentId: uuid("enrollment_id").notNull().references(() => englishEnrollments.id, { onDelete: "cascade" }),
    sessionDate: date("session_date").notNull(),
    present: boolean("present").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [unique("english_attendance_enrollment_session_unique").on(table.enrollmentId, table.sessionDate)]
);
