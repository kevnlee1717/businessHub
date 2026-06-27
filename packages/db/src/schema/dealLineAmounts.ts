import { integer, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { billing } from "./billing";
import { dealParties } from "./dealParties";
import { schemeLineKindEnum, schemeLineRecurrenceEnum } from "./enums";
import { schemeLines } from "./schemeLines";

export const dealLineAmounts = pgTable("deal_line_amounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  billingId: uuid("billing_id").notNull().references(() => billing.id, { onDelete: "cascade" }),
  schemeLineId: uuid("scheme_line_id").references(() => schemeLines.id, { onDelete: "set null" }),
  kind: schemeLineKindEnum("kind").notNull(),
  recurrence: schemeLineRecurrenceEnum("recurrence").notNull(),
  partyId: uuid("party_id").references(() => dealParties.id, { onDelete: "set null" }),
  label: text("label"),
  amountPerPeriod: numeric("amount_per_period", { precision: 12, scale: 2 }),
  periodsCount: integer("periods_count"),
  amountTotalExpected: numeric("amount_total_expected", { precision: 12, scale: 2 }),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow()
});
