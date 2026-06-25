import { integer, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const englishLevels = pgTable("english_levels", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  nameEn: text("name_en"),
  level: integer("level"),
  priceSgd: numeric("price_sgd", { precision: 12, scale: 2 }),
  duration: text("duration"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
