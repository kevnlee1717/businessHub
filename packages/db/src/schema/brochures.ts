import { integer, pgTable, text, timestamp, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { employees } from "./employees";

export const brochureIndustries = pgTable("brochure_industries", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const brochureCategories = pgTable("brochure_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const brochures = pgTable("brochures", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  industryId: uuid("industry_id").references(() => brochureIndustries.id, { onDelete: "set null" }),
  categoryId: uuid("category_id").references(() => brochureCategories.id, { onDelete: "set null" }),
  notes: text("notes"),
  currentVersionId: uuid("current_version_id").references((): AnyPgColumn => brochureVersions.id, {
    onDelete: "set null"
  }),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by").references(() => employees.id, { onDelete: "set null" })
});

export const brochureVersions = pgTable("brochure_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  brochureId: uuid("brochure_id")
    .notNull()
    .references(() => brochures.id, { onDelete: "cascade" }),
  versionNo: integer("version_no").notNull(),
  note: text("note"),
  filename: text("filename").notNull(),
  storagePath: text("storage_path").notNull(),
  mime: text("mime"),
  size: integer("size"),
  uploadedBy: uuid("uploaded_by").references(() => employees.id, { onDelete: "set null" }),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow()
});
