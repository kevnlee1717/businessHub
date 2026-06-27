import { date, integer, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { billing } from "./billing";
import { caseSteps } from "./caseSteps";
import { chargeKindEnum, chargeStatusEnum, currencyEnum } from "./enums";
import { schemeLines } from "./schemeLines";

export const billingCharges = pgTable("billing_charges", {
  id: uuid("id").primaryKey().defaultRandom(),
  billingId: uuid("billing_id").notNull().references(() => billing.id, { onDelete: "cascade" }),
  schemeLineId: uuid("scheme_line_id").references(() => schemeLines.id, { onDelete: "set null" }),
  chargeKind: chargeKindEnum("charge_kind").notNull(),
  seq: integer("seq").notNull(),
  label: text("label").notNull(),
  period: text("period"),
  dueDate: date("due_date"),
  caseStepId: uuid("case_step_id").references(() => caseSteps.id, { onDelete: "set null" }),
  amountExpected: numeric("amount_expected", { precision: 12, scale: 2 }).notNull(),
  amountCollected: numeric("amount_collected", { precision: 12, scale: 2 }).notNull().default("0"),
  status: chargeStatusEnum("status").notNull().default("pending"),
  currency: currencyEnum("currency").notNull().default("SGD"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
