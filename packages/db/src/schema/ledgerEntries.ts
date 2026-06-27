import { sql } from "drizzle-orm";
import { numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { bankAccounts } from "./bankAccounts";
import { billing } from "./billing";
import { businesses } from "./businesses";
import { companies } from "./companies";
import { employees } from "./employees";
import { currencyEnum, ledgerDirectionEnum, ledgerSourceEnum, reconcileStatusEnum } from "./enums";
import { expenseCategories } from "./expenseCategories";

export const ledgerEntries = pgTable("ledger_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "restrict" }),
  bankAccountId: uuid("bank_account_id").references(() => bankAccounts.id, { onDelete: "set null" }),
  direction: ledgerDirectionEnum("direction").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  currency: currencyEnum("currency").notNull().default("SGD"),
  fxRate: numeric("fx_rate", { precision: 12, scale: 6 }),
  sgdEquivalent: numeric("sgd_equivalent", { precision: 12, scale: 2 }).notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "set null" }),
  billingId: uuid("billing_id").references(() => billing.id, { onDelete: "set null" }),
  expenseCategoryId: uuid("expense_category_id").references(() => expenseCategories.id, { onDelete: "set null" }),
  counterparty: text("counterparty"),
  proofDocumentIds: uuid("proof_document_ids").array().notNull().default(sql`ARRAY[]::uuid[]`),
  sourceType: ledgerSourceEnum("source_type").notNull().default("manual"),
  sourceId: uuid("source_id"),
  reconcileStatus: reconcileStatusEnum("reconcile_status").notNull().default("unreconciled"),
  statementLineId: uuid("statement_line_id"),
  note: text("note"),
  recordedBy: uuid("recorded_by").references(() => employees.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
