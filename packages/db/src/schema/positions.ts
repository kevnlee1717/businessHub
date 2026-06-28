import { sql } from "drizzle-orm";
import { boolean, integer, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";
import { dataScopeEnum } from "./enums";

export const positions = pgTable("positions", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  nameEn: text("name_en"),
  note: text("note"),
  permissions: text("permissions").array().notNull().default(sql`'{}'::text[]`),
  dataScope: dataScopeEnum("data_scope").notNull().default("self"),
  isSystem: boolean("is_system").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
