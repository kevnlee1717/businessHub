import { numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { cases } from "./cases";
import { dealParties } from "./dealParties";
import { commissionTargetEnum, milestoneBasisEnum } from "./enums";
import { externalParties } from "./externalParties";

export const caseCommissions = pgTable("case_commissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
  target: commissionTargetEnum("target").notNull(),
  partyId: uuid("party_id").references(() => dealParties.id, { onDelete: "set null" }),
  externalPartyId: uuid("external_party_id").references(() => externalParties.id, { onDelete: "set null" }),
  basis: milestoneBasisEnum("basis").notNull(),
  value: numeric("value", { precision: 12, scale: 2 }).notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
