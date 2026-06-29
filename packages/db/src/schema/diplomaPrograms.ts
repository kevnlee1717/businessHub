import { boolean, integer, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const diplomaPrograms = pgTable("diploma_programs", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  nameEn: text("name_en"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order"),
  months: integer("months"),
  priceSgd: numeric("price_sgd", { precision: 12, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
