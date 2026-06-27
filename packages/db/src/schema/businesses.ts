import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { businessStatusEnum, currencyEnum } from "./enums";

export const businesses = pgTable("businesses", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "restrict" }),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  nameEn: text("name_en"),
  category: text("category"),
  status: businessStatusEnum("status").notNull().default("active"),
  // 结算币种:整套方案规则跟随业务这一种币(业主选定"一个业务一种币")
  currency: currencyEnum("currency").notNull().default("SGD"),
  // Plain uuid for now; no foreign key to scheme_versions to avoid a circular table reference.
  defaultVersionId: uuid("default_version_id"),
  sortOrder: integer("sort_order").notNull().default(0),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
