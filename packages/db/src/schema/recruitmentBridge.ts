import { sql } from "drizzle-orm";
import { boolean, check, date, integer, pgTable, text, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { employees } from "./employees";

export const ifmCompaniesCache = pgTable("ifm_companies_cache", {
  ifmCompanyId: text("ifm_company_id").primaryKey(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow()
});

export const recruitmentIfmUserBindings = pgTable(
  "recruitment_ifm_user_bindings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ifmUserId: text("ifm_user_id").notNull(),
    ifmDisplayName: text("ifm_display_name"),
    employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "set null" }),
    bridgeRole: text("bridge_role").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("recruitment_ifm_user_bindings_ifm_user_id_unique").on(table.ifmUserId),
    check("recruitment_ifm_user_bindings_bridge_role_check", sql`${table.bridgeRole} in ('manager', 'operator')`)
  ]
);

export const recruitmentKpiTargets = pgTable(
  "recruitment_kpi_targets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    assigneeEmployeeId: uuid("assignee_employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    metric: text("metric").notNull(),
    platform: varchar("platform", { length: 120 }),
    // 周期粒度：目标数 target_per_day 的含义 = 每 period 完成 N 个（列名历史原因保留）
    period: text("period").notNull().default("daily"),
    targetPerDay: integer("target_per_day").notNull(),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    issuedBySource: text("issued_by_source").notNull().default("bh"),
    issuedByIfmUser: text("issued_by_ifm_user"),
    issuedByEmployeeId: uuid("issued_by_employee_id").references(() => employees.id, { onDelete: "set null" }),
    note: text("note"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check(
      "recruitment_kpi_targets_metric_check",
      sql`${table.metric} in ('daily_posts', 'daily_new_group_owners', 'daily_contacts')`
    ),
    check("recruitment_kpi_targets_issued_by_source_check", sql`${table.issuedBySource} in ('ifm', 'bh')`),
    check("recruitment_kpi_targets_period_check", sql`${table.period} in ('daily', 'weekly', 'monthly')`)
  ]
);

export const recruitmentGroupOwners = pgTable("recruitment_group_owners", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  platform: varchar("platform", { length: 120 }).notNull(),
  groupName: varchar("group_name", { length: 200 }).notNull(),
  ownerName: varchar("owner_name", { length: 200 }),
  ownerContact: varchar("owner_contact", { length: 120 }),
  groupUrl: varchar("group_url", { length: 1024 }),
  memberCount: integer("member_count"),
  foundBy: uuid("found_by").notNull().references(() => employees.id),
  foundOn: date("found_on").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});
