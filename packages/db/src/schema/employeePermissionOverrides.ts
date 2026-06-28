import { pgTable, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { employees } from "./employees";
import { permissionEffectEnum } from "./enums";

export const employeePermissionOverrides = pgTable(
  "employee_permission_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    permission: varchar("permission", { length: 64 }).notNull(),
    effect: permissionEffectEnum("effect").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("employee_permission_overrides_employee_permission_unique").on(table.employeeId, table.permission)
  ]
);
