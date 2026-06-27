import { boolean, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { schemeLineRecurrenceEnum } from "./enums";

export const collectionItems = pgTable("collection_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  nameEn: text("name_en"),
  defaultRecurrence: schemeLineRecurrenceEnum("default_recurrence"),
  active: boolean("active").notNull().default(true),
  isSystem: boolean("is_system").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
