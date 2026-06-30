import { boolean, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { billingCharges } from "./billingCharges";
import { cases } from "./cases";
import { caseServiceSourceEnum, caseServiceStatusEnum } from "./enums";
import { serviceItems } from "./serviceItems";

export const caseServices = pgTable("case_services", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
  serviceItemId: uuid("service_item_id").notNull().references(() => serviceItems.id),
  nameSnapshot: text("name_snapshot").notNull(),
  source: caseServiceSourceEnum("source").notNull(),
  isBillable: boolean("is_billable").notNull(),
  priceSgd: numeric("price_sgd", { precision: 12, scale: 2 }),
  chargeId: uuid("charge_id").references(() => billingCharges.id, { onDelete: "set null" }),
  status: caseServiceStatusEnum("status").notNull().default("active"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
