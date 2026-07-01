import { numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { dealParties } from "./dealParties";
import { commissionTargetEnum, milestoneBasisEnum } from "./enums";
import { servicePackages } from "./packages";

export const packageCommissions = pgTable("package_commissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  packageId: uuid("package_id").notNull().references(() => servicePackages.id, { onDelete: "cascade" }),
  target: commissionTargetEnum("target").notNull(),
  basis: milestoneBasisEnum("basis").notNull(),
  value: numeric("value", { precision: 12, scale: 2 }).notNull(),
  defaultPartyId: uuid("default_party_id").references(() => dealParties.id, { onDelete: "set null" }),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
