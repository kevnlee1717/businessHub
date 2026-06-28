import {
  boolean,
  date,
  timestamp,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import {
  currencyEnum,
  dataScopeEnum,
  employeeStatusEnum,
  employmentTypeEnum,
  payrollSchemeEnum,
  roleEnum
} from "./enums";
import { pgTable } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { positions } from "./positions";
import { workShifts } from "./workShifts";

export const employees = pgTable("employees", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  nameEn: varchar("name_en", { length: 255 }),
  email: varchar("email", { length: 320 }).notNull().unique(),
  phone: varchar("phone", { length: 64 }),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  role: roleEnum("role"),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
  positionId: uuid("position_id").references(() => positions.id, { onDelete: "set null" }),
  shiftId: uuid("shift_id").references(() => workShifts.id, { onDelete: "set null" }),
  employmentType: employmentTypeEnum("employment_type").notNull().default("full_time"),
  status: employeeStatusEnum("status").notNull().default("active"),
  dataScope: dataScopeEnum("data_scope").notNull().default("self"),
  joinDate: date("join_date"),
  payrollScheme: payrollSchemeEnum("payroll_scheme"),
  salaryCurrency: currencyEnum("salary_currency").notNull().default("SGD"),
  gpsTrackingEnabled: boolean("gps_tracking_enabled").notNull().default(false),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});
