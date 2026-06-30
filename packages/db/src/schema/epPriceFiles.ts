import { text, timestamp, uuid } from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";
import { employees } from "./employees";
import { epPriceFileSlotEnum } from "./enums";

export const epPriceFiles = pgTable("ep_price_files", {
  slot: epPriceFileSlotEnum("slot").notNull().unique(),
  filename: text("filename").notNull(),
  storagePath: text("storage_path").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by").references(() => employees.id, { onDelete: "set null" })
});
