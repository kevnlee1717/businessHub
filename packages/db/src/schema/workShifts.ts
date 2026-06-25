import { boolean, integer, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";

export const workShifts = pgTable("work_shifts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  startMin: integer("start_min").notNull(),
  endMin: integer("end_min").notNull(),
  allowedLateCount: integer("allowed_late_count").notNull().default(0),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
