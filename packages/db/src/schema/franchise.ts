import {
  boolean,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
  type AnyPgColumn
} from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { employees } from "./employees";
import {
  franchiseContractExpiryEnum,
  franchiseDecisionMakerEnum,
  franchiseFootfallEnum,
  franchiseInterestLevelEnum,
  franchiseOrgTypeEnum,
  franchisePriorityEnum,
  franchisePropertyTypeEnum,
  franchiseSiteStatusEnum,
  franchiseTriStateEnum
} from "./enums";

export const franchiseOrgs = pgTable("franchise_org", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 200 }).notNull(),
  type: franchiseOrgTypeEnum("type").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const franchiseContacts = pgTable("franchise_contact", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 200 }).notNull(),
  role: varchar("role", { length: 120 }),
  phone: varchar("phone", { length: 64 }),
  orgId: uuid("org_id").references(() => franchiseOrgs.id, { onDelete: "set null" }),
  referredByContactId: uuid("referred_by_contact_id").references((): AnyPgColumn => franchiseContacts.id, {
    onDelete: "set null"
  }),
  nextVisitAt: timestamp("next_visit_at", { withTimezone: true }),
  ownerId: uuid("owner_id").references(() => employees.id, { onDelete: "set null" }),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const franchiseProperties = pgTable("franchise_property", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 200 }).notNull(),
  propertyType: franchisePropertyTypeEnum("property_type").notNull(),
  address: text("address"),
  orgId: uuid("org_id").references(() => franchiseOrgs.id, { onDelete: "set null" }),
  isVendingSite: boolean("is_vending_site").notNull().default(false),
  vendingNote: text("vending_note"),
  introducedByContactId: uuid("introduced_by_contact_id").references((): AnyPgColumn => franchiseContacts.id, {
    onDelete: "set null"
  }),
  relationshipNote: text("relationship_note"),
  priority: franchisePriorityEnum("priority").notNull(),
  footfall: franchiseFootfallEnum("footfall"),
  decisionMaker: franchiseDecisionMakerEnum("decision_maker"),
  hasPublicSpace: franchiseTriStateEnum("has_public_space"),
  status: franchiseSiteStatusEnum("status").notNull().default("unvisited"),
  ownerId: uuid("owner_id").references(() => employees.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const franchisePropertyVisits = pgTable("franchise_property_visit", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  propertyId: uuid("property_id").notNull().references(() => franchiseProperties.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").references(() => franchiseContacts.id, { onDelete: "set null" }),
  byEmployeeId: uuid("by_employee_id").notNull().references(() => employees.id),
  visitedAt: timestamp("visited_at", { withTimezone: true }).notNull(),
  interestLevel: franchiseInterestLevelEnum("interest_level").notNull(),
  servicesPitched: text("services_pitched").array(),
  result: text("result"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const franchisePropertySurveys = pgTable(
  "franchise_property_survey",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    visitId: uuid("visit_id").notNull().references(() => franchisePropertyVisits.id, { onDelete: "cascade" }),
    interestedServices: text("interested_services").array(),
    details: jsonb("details").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [unique("franchise_property_survey_visit_unique").on(table.visitId)]
);

export const franchiseFnbSites = pgTable("franchise_fnb_site", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 200 }).notNull(),
  orgId: uuid("org_id").references(() => franchiseOrgs.id, { onDelete: "set null" }),
  location: text("location"),
  hasAircon: boolean("has_aircon"),
  introducedByContactId: uuid("introduced_by_contact_id").references((): AnyPgColumn => franchiseContacts.id, {
    onDelete: "set null"
  }),
  relationshipNote: text("relationship_note"),
  priority: franchisePriorityEnum("priority").notNull(),
  status: franchiseSiteStatusEnum("status").notNull().default("unvisited"),
  ownerId: uuid("owner_id").references(() => employees.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const franchiseFnbVisits = pgTable("franchise_fnb_visit", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  siteId: uuid("site_id").notNull().references(() => franchiseFnbSites.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").references(() => franchiseContacts.id, { onDelete: "set null" }),
  byEmployeeId: uuid("by_employee_id").notNull().references(() => employees.id),
  visitedAt: timestamp("visited_at", { withTimezone: true }).notNull(),
  interestLevel: franchiseInterestLevelEnum("interest_level").notNull(),
  result: text("result"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const franchiseFnbSurveys = pgTable(
  "franchise_fnb_survey",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    visitId: uuid("visit_id").notNull().references(() => franchiseFnbVisits.id, { onDelete: "cascade" }),
    rentFixed: numeric("rent_fixed", { precision: 12, scale: 2 }),
    rentRevenueSharePct: numeric("rent_revenue_share_pct", { precision: 6, scale: 2 }),
    managementFee: numeric("management_fee", { precision: 12, scale: 2 }),
    dishwashFee: numeric("dishwash_fee", { precision: 12, scale: 2 }),
    contractExpiry: franchiseContractExpiryEnum("contract_expiry"),
    extra: jsonb("extra").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [unique("franchise_fnb_survey_visit_unique").on(table.visitId)]
);
