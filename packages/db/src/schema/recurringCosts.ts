import { sql } from "drizzle-orm";
import { boolean, check, integer, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { currencyEnum } from "./enums";
import { expenseCategories } from "./expenseCategories";

export const recurringCosts = pgTable(
  "recurring_costs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    expenseCategoryId: uuid("expense_category_id").references(() => expenseCategories.id, { onDelete: "set null" }),
    label: text("label").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: currencyEnum("currency").notNull().default("SGD"),
    dueDay: integer("due_day").notNull(),
    active: boolean("active").notNull().default(true),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [check("recurring_costs_due_day_check", sql`${table.dueDay} between 1 and 28`)]
);
