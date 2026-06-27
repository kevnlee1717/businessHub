import { jsonb, numeric, timestamp, uuid } from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";
import {
  billingRefTypeEnum,
  billingStatusEnum,
  commissionTypeEnum
} from "./enums";
import { businesses } from "./businesses";
import { employees } from "./employees";
import { schemeVersions } from "./schemeVersions";

export const billing = pgTable("billing", {
  id: uuid("id").primaryKey().defaultRandom(),
  refType: billingRefTypeEnum("ref_type").notNull(),
  refId: uuid("ref_id").notNull(),
  totalPriceSgd: numeric("total_price_sgd", { precision: 12, scale: 2 }).notNull().default("0"),
  depositSgd: numeric("deposit_sgd", { precision: 12, scale: 2 }).notNull().default("0"),
  status: billingStatusEnum("status").notNull().default("unpaid"),
  salesId: uuid("sales_id").references(() => employees.id, { onDelete: "set null" }),
  commissionType: commissionTypeEnum("commission_type"),
  commissionValue: numeric("commission_value", { precision: 12, scale: 2 }),
  commissionAmountSgd: numeric("commission_amount_sgd", { precision: 12, scale: 2 }),
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "set null" }),
  schemeVersionId: uuid("scheme_version_id").references(() => schemeVersions.id, { onDelete: "set null" }),
  inputs: jsonb("inputs").$type<Record<string, unknown>>(),
  externalPayees: jsonb("external_payees").$type<Record<string, string>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});
