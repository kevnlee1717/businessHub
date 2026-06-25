import { date, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";
import { attendanceRecords } from "./attendanceRecords";
import { attendanceDayStatusEnum } from "./enums";
import { employees } from "./employees";

export const attendanceDays = pgTable(
  "attendance_days",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    workDate: date("work_date").notNull(),
    clockInId: uuid("clock_in_id").references(() => attendanceRecords.id, { onDelete: "set null" }),
    clockOutId: uuid("clock_out_id").references(() => attendanceRecords.id, { onDelete: "set null" }),
    status: attendanceDayStatusEnum("status"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [unique("attendance_days_employee_date_unique").on(table.employeeId, table.workDate)]
);
