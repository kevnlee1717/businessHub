import { numeric, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";
import { billingCharges } from "./billingCharges";
import { billing } from "./billing";
import { currencyEnum, paymentTypeEnum } from "./enums";
import { employees } from "./employees";

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  billingId: uuid("billing_id").notNull().references(() => billing.id, { onDelete: "cascade" }),
  chargeId: uuid("charge_id").references(() => billingCharges.id, { onDelete: "set null" }),
  paidCurrency: currencyEnum("paid_currency").notNull(),
  paidAmount: numeric("paid_amount", { precision: 12, scale: 2 }).notNull(),
  fxRate: numeric("fx_rate", { precision: 12, scale: 6 }),
  sgdEquivalent: numeric("sgd_equivalent", { precision: 12, scale: 2 }).notNull(),
  type: paymentTypeEnum("type").notNull(),
  recordedBy: uuid("recorded_by").references(() => employees.id, { onDelete: "set null" }),
  paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
  note: text("note")
});
