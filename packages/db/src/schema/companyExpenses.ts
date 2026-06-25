import { numeric, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { documents } from "./documents";
import { companyExpenseTypeEnum, currencyEnum } from "./enums";

export const companyExpenses = pgTable("company_expenses", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  type: companyExpenseTypeEnum("type").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
  currency: currencyEnum("currency").notNull().default("SGD"),
  period: text("period"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  note: text("note"),
  documentId: uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
