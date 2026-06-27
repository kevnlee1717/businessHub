import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { reportSectionEnum } from "./enums";

export const expenseCategories = pgTable("expense_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  nameEn: text("name_en"),
  reportSection: reportSectionEnum("report_section").notNull().default("operating_expense"),
  active: boolean("active").notNull().default(true),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
