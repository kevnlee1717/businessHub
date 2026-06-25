import { numeric, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";
import { statutoryTypeEnum } from "./enums";
import { employees } from "./employees";

export const statutoryPayments = pgTable("statutory_payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: statutoryTypeEnum("type").notNull(),
  period: text("period").notNull(),
  employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "set null" }),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  reference: text("reference"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
