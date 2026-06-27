import { integer, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { billing } from "./billing";
import { businesses } from "./businesses";
import { dealParties } from "./dealParties";
import { commissionEntryStatusEnum, commissionRecurrenceEnum } from "./enums";
import { externalParties } from "./externalParties";
import { ledgerEntries } from "./ledgerEntries";

export const externalCommissionEntries = pgTable("external_commission_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  payeeId: uuid("payee_id").notNull().references(() => externalParties.id, { onDelete: "cascade" }),
  billingId: uuid("billing_id").notNull().references(() => billing.id, { onDelete: "cascade" }),
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "set null" }),
  partyId: uuid("party_id").references(() => dealParties.id, { onDelete: "set null" }),
  period: text("period").notNull(),
  recurrence: commissionRecurrenceEnum("recurrence").notNull(),
  seq: integer("seq").notNull().default(1),
  amountSgd: numeric("amount_sgd", { precision: 12, scale: 2 }).notNull(),
  status: commissionEntryStatusEnum("status").notNull().default("pending"),
  ledgerEntryId: uuid("ledger_entry_id").references(() => ledgerEntries.id, { onDelete: "set null" }),
  sourceLineId: uuid("source_line_id"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
