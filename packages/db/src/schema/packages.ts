import { boolean, integer, numeric, pgTable, text, uuid } from "drizzle-orm/pg-core";

export const servicePackages = pgTable("packages", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  nameEn: text("name_en").notNull(),
  basePriceSgd: numeric("base_price_sgd", { precision: 12, scale: 2 }).notNull(),
  tagline: text("tagline"),
  isRecommended: boolean("is_recommended").notNull().default(false),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull()
});
