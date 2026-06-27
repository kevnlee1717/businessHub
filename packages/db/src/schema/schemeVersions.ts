import { date, jsonb, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { businesses } from "./businesses";
import { schemeVersionStatusEnum } from "./enums";

export const schemeVersions = pgTable("scheme_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  status: schemeVersionStatusEnum("status").notNull().default("active"),
  effectiveFrom: date("effective_from"),
  effectiveTo: date("effective_to"),
  assumedInputs: jsonb("assumed_inputs").$type<Record<string, unknown>>(),
  profitRate: numeric("profit_rate", { precision: 6, scale: 3 }),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
