import { boolean, jsonb, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { employees } from "./employees";

export type FnbFoodCourtFixedFees = {
  cleaning: number;
  maintenance: number;
  pos: number;
  subscription: number;
  bank: number;
  legal: number;
  other: number;
};

export const fnbFoodCourts = pgTable("fnb_food_courts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  stall: text("stall"),
  brand: text("brand"),
  notes: text("notes"),
  rentPct: numeric("rent_pct", { precision: 8, scale: 2 }),
  minRent: numeric("min_rent", { precision: 12, scale: 2 }),
  advPct: numeric("adv_pct", { precision: 8, scale: 2 }),
  advMode: text("adv_mode").$type<"pct" | "fixed">().notNull().default("pct"),
  mdrPct: numeric("mdr_pct", { precision: 8, scale: 2 }),
  mdrMode: text("mdr_mode").$type<"pct" | "fixed">().notNull().default("pct"),
  fixedFees: jsonb("fixed_fees").$type<FnbFoodCourtFixedFees | null>(),
  entranceMonthly: numeric("entrance_monthly", { precision: 12, scale: 2 }),
  mgmtPct: numeric("mgmt_pct", { precision: 8, scale: 2 }).notNull().default("3"),
  foodPct: numeric("food_pct", { precision: 8, scale: 2 }).notNull().default("35"),
  gstPct: numeric("gst_pct", { precision: 8, scale: 2 }).notNull().default("9"),
  includeGst: boolean("include_gst").notNull().default(true),
  salary: numeric("salary", { precision: 12, scale: 2 }).notNull().default("8000"),
  investorFloor: numeric("investor_floor", { precision: 12, scale: 2 }).notNull().default("2800"),
  investorSharePct: numeric("investor_share_pct", { precision: 8, scale: 2 }).notNull().default("51"),
  coupleFloor: numeric("couple_floor", { precision: 12, scale: 2 }).notNull().default("3000"),
  coupleRepayCap: numeric("couple_repay_cap", { precision: 12, scale: 2 }).notNull().default("4167"),
  profitTarget: numeric("profit_target", { precision: 12, scale: 2 }).notNull().default("5600"),
  excessMgmtPct: numeric("excess_mgmt_pct", { precision: 8, scale: 2 }).notNull().default("50"),
  excessCouplePct: numeric("excess_couple_pct", { precision: 8, scale: 2 }).notNull().default("25"),
  tiers: jsonb("tiers").$type<number[]>().notNull().default([25000, 30000, 35000, 40000, 45000, 50000]),
  createdBy: uuid("created_by").references(() => employees.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});
