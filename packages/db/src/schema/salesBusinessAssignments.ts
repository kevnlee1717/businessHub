import { boolean, numeric, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { businesses } from "./businesses";
import { employees } from "./employees";
import { commissionTypeEnum } from "./enums";

export const salesBusinessAssignments = pgTable(
  "sales_business_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    salesId: uuid("sales_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    commissionType: commissionTypeEnum("commission_type"),
    commissionValue: numeric("commission_value", { precision: 12, scale: 2 }),
    active: boolean("active").notNull().default(true),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [unique("sales_business_assignments_sales_business_unique").on(table.salesId, table.businessId)]
);
