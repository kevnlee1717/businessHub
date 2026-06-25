import { boolean, integer, jsonb, numeric, timestamp, uuid } from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";

export const payrollSettings = pgTable("payroll_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  cpfRates: jsonb("cpf_rates"),
  levyAmount: numeric("levy_amount", { precision: 12, scale: 2 }),
  chinaFundRate: numeric("china_fund_rate", { precision: 6, scale: 2 }),
  attendanceAllowedLate: integer("attendance_allowed_late").notNull().default(0),
  kpiCap100: boolean("kpi_cap_100").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});
