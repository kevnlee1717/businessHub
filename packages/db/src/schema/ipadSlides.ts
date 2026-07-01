import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { employees } from "./employees";

export const ipadSlides = pgTable("ipad_slides", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  filename: text("filename").notNull(),
  storagePath: text("storage_path").notNull(),
  thumbPath: text("thumb_path"),
  mime: text("mime"),
  size: integer("size"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdBy: uuid("created_by").references(() => employees.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});
