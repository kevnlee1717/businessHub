import { boolean, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { bankAccounts } from "./bankAccounts";
import { currencyEnum, ledgerDirectionEnum } from "./enums";
import { ledgerEntries } from "./ledgerEntries";

export const bankStatementLines = pgTable("bank_statement_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  bankAccountId: uuid("bank_account_id").notNull().references(() => bankAccounts.id, { onDelete: "cascade" }),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  direction: ledgerDirectionEnum("direction").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  currency: currencyEnum("currency").notNull().default("SGD"),
  description: text("description"),
  balanceAfter: numeric("balance_after", { precision: 12, scale: 2 }),
  importBatch: text("import_batch"),
  matched: boolean("matched").notNull().default(false),
  ledgerEntryId: uuid("ledger_entry_id").references(() => ledgerEntries.id, { onDelete: "set null" }),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
