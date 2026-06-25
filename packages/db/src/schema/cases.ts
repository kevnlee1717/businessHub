import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { billing } from "./billing";
import { clients } from "./clients";
import { businessTypeEnum, caseStatusEnum } from "./enums";

export const cases = pgTable("cases", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessType: businessTypeEnum("business_type").notNull(),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
  currentStep: integer("current_step").notNull().default(0),
  status: caseStatusEnum("status").notNull().default("open"),
  billingId: uuid("billing_id").references(() => billing.id, { onDelete: "set null" }),
  guarantorName: text("guarantor_name"),
  guarantorRelation: text("guarantor_relation"),
  guarantorContact: text("guarantor_contact"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});
