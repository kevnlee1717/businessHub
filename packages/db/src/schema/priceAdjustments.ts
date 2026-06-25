import { text, timestamp, uuid } from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";
import { billing } from "./billing";
import { employees } from "./employees";

export const priceAdjustments = pgTable("price_adjustments", {
  id: uuid("id").primaryKey().defaultRandom(),
  billingId: uuid("billing_id").notNull().references(() => billing.id, { onDelete: "cascade" }),
  field: text("field").notNull(),
  oldValue: text("old_value").notNull(),
  newValue: text("new_value").notNull(),
  changedBy: uuid("changed_by").notNull().references(() => employees.id, { onDelete: "restrict" }),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow()
});
