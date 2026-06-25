import { text, timestamp, uuid } from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";
import { industries } from "./industries";

export const companies = pgTable("companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  nameEn: text("name_en"),
  uen: text("uen"),
  industryId: uuid("industry_id").references(() => industries.id, { onDelete: "set null" }),
  status: text("status").notNull().default("active"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
