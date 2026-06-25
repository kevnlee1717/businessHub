import { pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { clockPoints } from "./clockPoints";
import { employees } from "./employees";

export const employeeClockPoints = pgTable(
  "employee_clock_points",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    clockPointId: uuid("clock_point_id").notNull().references(() => clockPoints.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [unique("employee_clock_points_unique").on(table.employeeId, table.clockPointId)]
);
