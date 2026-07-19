import { pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { industries } from "./industries";
import { workShifts } from "./workShifts";

export const companies = pgTable(
  "companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    nameEn: text("name_en"),
    uen: text("uen"),
    ifmCompanyId: text("ifm_company_id"),
    industryId: uuid("industry_id").references(() => industries.id, { onDelete: "set null" }),
    shiftId: uuid("shift_id").references(() => workShifts.id, { onDelete: "set null" }),
    status: text("status").notNull().default("active"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [uniqueIndex("companies_ifm_company_id_unique").on(table.ifmCompanyId)]
);
