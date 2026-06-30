import { boolean, date, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { bankAccountTypeEnum, currencyEnum } from "./enums";

export const bankAccounts = pgTable("bank_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: bankAccountTypeEnum("type"),
  bankName: text("bank_name"),
  accountNo: text("account_no"),
  currency: currencyEnum("currency").notNull().default("SGD"),
  isPrimary: boolean("is_primary").notNull().default(false),
  openingBalance: numeric("opening_balance", { precision: 12, scale: 2 }).notNull().default("0"),
  openingDate: date("opening_date"),
  active: boolean("active").notNull().default(true),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
