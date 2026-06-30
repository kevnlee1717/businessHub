import { boolean, integer, numeric, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { serviceCategoryEnum } from "./enums";

export const serviceItems = pgTable("service_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  nameEn: text("name_en").notNull(),
  category: serviceCategoryEnum("category").notNull(),
  defaultPriceSgd: numeric("default_price_sgd", { precision: 12, scale: 2 }).notNull(),
  isCore: boolean("is_core").notNull(),
  billable: boolean("billable").notNull(),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull()
});
