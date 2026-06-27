import { integer, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { billing } from "./billing";
import { businesses } from "./businesses";
import { employees } from "./employees";
import { commissionEntryStatusEnum, commissionRecurrenceEnum } from "./enums";
import { payslips } from "./payslips";

export const commissionEntries = pgTable("commission_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  salesId: uuid("sales_id").notNull().references(() => employees.id),
  billingId: uuid("billing_id").notNull().references(() => billing.id, { onDelete: "cascade" }),
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "set null" }),
  period: text("period").notNull(),
  recurrence: commissionRecurrenceEnum("recurrence").notNull(),
  seq: integer("seq").notNull().default(1),
  amountSgd: numeric("amount_sgd", { precision: 12, scale: 2 }).notNull(),
  amountOverride: numeric("amount_override", { precision: 12, scale: 2 }),
  status: commissionEntryStatusEnum("status").notNull().default("pending"),
  payslipId: uuid("payslip_id").references(() => payslips.id, { onDelete: "set null" }),
  sourceLineId: uuid("source_line_id"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
