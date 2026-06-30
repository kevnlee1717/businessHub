import { date, integer, numeric, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";

// 租房地点(每个租赁场地一条),带租约元信息与地图坐标。
export const rentLocations = pgTable("rent_locations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  address: text("address"),
  lat: numeric("lat"),
  lng: numeric("lng"),
  landlordName: text("landlord_name"),
  leaseStart: date("lease_start"),
  leaseMonths: integer("lease_months"),
  monthlyRent: numeric("monthly_rent", { precision: 12, scale: 2 }),
  deposit: numeric("deposit", { precision: 12, scale: 2 }),
  currency: varchar("currency", { length: 8 }).notNull().default("SGD"),
  note: text("note"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
