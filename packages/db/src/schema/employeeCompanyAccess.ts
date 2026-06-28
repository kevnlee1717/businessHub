import { pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { employees } from "./employees";

export const employeeCompanyAccess = pgTable(
  "employee_company_access",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [unique("employee_company_access_employee_company_unique").on(table.employeeId, table.companyId)]
);
