import { date, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { employees } from "./employees";
import { fnbFoodCourts } from "./fnbFoodCourts";

const auditColumns = {
  createdBy: uuid("created_by").references(() => employees.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
};

export const mlkInvestors = pgTable("mlk_investors", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  companyName: text("company_name"),
  uen: text("uen"),
  idNo: text("id_no"),
  phone: text("phone"),
  wechat: text("wechat"),
  address: text("address"),
  serviceTier: text("service_tier").$type<"tier1" | "tier2">().notNull().default("tier1"),
  prStatus: text("pr_status").$type<"none" | "applied" | "granted">().notNull().default("none"),
  kycStatus: text("kyc_status").$type<"pending" | "done">().notNull().default("pending"),
  driveFolderId: uuid("drive_folder_id"),
  notes: text("notes"),
  ...auditColumns
});

export const mlkCouples = pgTable("mlk_couples", {
  id: uuid("id").primaryKey().defaultRandom(),
  operatorCompany: text("operator_company"),
  operatorUen: text("operator_uen"),
  husbandName: text("husband_name").notNull(),
  husbandIdNo: text("husband_id_no"),
  husbandPassport: text("husband_passport"),
  wifeName: text("wife_name").notNull(),
  wifeIdNo: text("wife_id_no"),
  wifePassport: text("wife_passport"),
  phone: text("phone"),
  wechat: text("wechat"),
  husbandEp: text("husband_ep").$type<"none" | "applied" | "granted">().notNull().default("none"),
  wifeEp: text("wife_ep").$type<"none" | "applied" | "granted">().notNull().default("none"),
  prStatus: text("pr_status").$type<"none" | "applied" | "granted">().notNull().default("none"),
  mentorId: uuid("mentor_id").references((): AnyPgColumn => mlkCouples.id, { onDelete: "set null" }),
  status: text("status").$type<"candidate" | "active" | "exited">().notNull().default("candidate"),
  joinedAt: timestamp("joined_at", { withTimezone: true }),
  exitedAt: timestamp("exited_at", { withTimezone: true }),
  driveFolderId: uuid("drive_folder_id"),
  notes: text("notes"),
  ...auditColumns
});

export const mlkStores = pgTable("mlk_stores", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  stall: text("stall"),
  address: text("address"),
  spvName: text("spv_name"),
  spvUen: text("spv_uen"),
  investorId: uuid("investor_id").references(() => mlkInvestors.id, { onDelete: "set null" }),
  coupleId: uuid("couple_id").references(() => mlkCouples.id, { onDelete: "set null" }),
  foodCourtId: uuid("food_court_id").references(() => fnbFoodCourts.id, { onDelete: "set null" }),
  kitchenStoreId: text("kitchen_store_id"),
  status: text("status")
    .$type<"intent" | "selected" | "incorporated" | "lease_signed" | "renovation" | "open" | "closed">()
    .notNull()
    .default("intent"),
  intentSignedAt: timestamp("intent_signed_at", { withTimezone: true }),
  selectedAt: timestamp("selected_at", { withTimezone: true }),
  incorporatedAt: timestamp("incorporated_at", { withTimezone: true }),
  leaseSignedAt: timestamp("lease_signed_at", { withTimezone: true }),
  renovationAt: timestamp("renovation_at", { withTimezone: true }),
  openedAt: timestamp("opened_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  fcDepositAmount: numeric("fc_deposit_amount", { precision: 12, scale: 2 }),
  driveFolderId: uuid("drive_folder_id"),
  notes: text("notes"),
  ...auditColumns
});

export const mlkPayments = pgTable("mlk_payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  investorId: uuid("investor_id")
    .notNull()
    .references(() => mlkInvestors.id, { onDelete: "cascade" }),
  storeId: uuid("store_id").references(() => mlkStores.id, { onDelete: "cascade" }),
  kind: text("kind")
    .$type<
      | "instalment1"
      | "instalment2"
      | "instalment3"
      | "instalment4"
      | "fc_deposit"
      | "service_tier1"
      | "service_tier2_first"
      | "service_tier2_second"
    >()
    .notNull(),
  amountDue: numeric("amount_due", { precision: 12, scale: 2 }).notNull().default("0"),
  amountPaid: numeric("amount_paid", { precision: 12, scale: 2 }).notNull().default("0"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  status: text("status").$type<"pending" | "paid" | "refunded">().notNull().default("pending"),
  notes: text("notes"),
  ...auditColumns
});

export const mlkLedger = pgTable("mlk_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  coupleId: uuid("couple_id")
    .notNull()
    .references(() => mlkCouples.id, { onDelete: "cascade" }),
  storeId: uuid("store_id").references(() => mlkStores.id, { onDelete: "set null" }),
  month: date("month", { mode: "string" }).notNull(),
  kind: text("kind")
    .$type<"advance_repay" | "retention_hold" | "retention_refund" | "bond_paid" | "bond_refund" | "platform_fee" | "mentor_income">()
    .notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  notes: text("notes"),
  ...auditColumns
});

export const mlkStoreRevenue = pgTable(
  "mlk_store_revenue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => mlkStores.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    turnover: numeric("turnover", { precision: 12, scale: 2 }).notNull(),
    source: text("source").$type<"kitchen" | "manual">().notNull().default("manual"),
    ...auditColumns
  },
  (table) => ({
    storeDate: uniqueIndex("mlk_store_revenue_store_date_uq").on(table.storeId, table.date)
  })
);

export const mlkSettlements = pgTable(
  "mlk_settlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => mlkStores.id, { onDelete: "cascade" }),
    month: date("month", { mode: "string" }).notNull(),
    turnover: numeric("turnover", { precision: 12, scale: 2 }).notNull().default("0"),
    netProfit: numeric("net_profit", { precision: 12, scale: 2 }).notNull().default("0"),
    investorPayout: numeric("investor_payout", { precision: 12, scale: 2 }).notNull().default("0"),
    couplePayout: numeric("couple_payout", { precision: 12, scale: 2 }).notNull().default("0"),
    mgmtPayout: numeric("mgmt_payout", { precision: 12, scale: 2 }).notNull().default("0"),
    detail: jsonb("detail"),
    ...auditColumns
  },
  (table) => ({
    storeMonth: uniqueIndex("mlk_settlements_store_month_uq").on(table.storeId, table.month)
  })
);
