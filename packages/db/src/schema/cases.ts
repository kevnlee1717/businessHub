import { date, integer, pgTable, text, timestamp, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { billing } from "./billing";
import { clients } from "./clients";
import { businessTypeEnum, caseStatusEnum } from "./enums";
import { guarantors } from "./guarantors";
import { servicePackages } from "./packages";

export const cases = pgTable("cases", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessType: businessTypeEnum("business_type").notNull(),
  parentCaseId: uuid("parent_case_id").references((): AnyPgColumn => cases.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
  currentStep: integer("current_step").notNull().default(0),
  status: caseStatusEnum("status").notNull().default("open"),
  billingId: uuid("billing_id").references(() => billing.id, { onDelete: "set null" }),
  packageId: uuid("package_id").references(() => servicePackages.id),
  guarantorId: uuid("guarantor_id").references(() => guarantors.id, { onDelete: "set null" }),
  guarantorName: text("guarantor_name"),
  guarantorRelation: text("guarantor_relation"),
  guarantorContact: text("guarantor_contact"),
  signedAt: date("signed_at"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});
