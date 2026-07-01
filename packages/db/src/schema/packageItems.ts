import { pgTable, unique, uuid } from "drizzle-orm/pg-core";
import { servicePackages } from "./packages";
import { serviceItems } from "./serviceItems";

export const packageItems = pgTable("package_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  packageId: uuid("package_id").notNull().references(() => servicePackages.id, { onDelete: "cascade" }),
  serviceItemId: uuid("service_item_id").notNull().references(() => serviceItems.id)
}, (table) => [unique("package_items_package_service_unique").on(table.packageId, table.serviceItemId)]);
