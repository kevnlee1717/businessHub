import { boolean, integer, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { appStateEnum, gpsTriggerEnum } from "./enums";
import { employees } from "./employees";

export const gpsTracks = pgTable("gps_tracks", {
  id: uuid("id").primaryKey().defaultRandom(),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  lat: numeric("lat", { precision: 10, scale: 7 }).notNull(),
  lng: numeric("lng", { precision: 10, scale: 7 }).notNull(),
  accuracy: numeric("accuracy", { precision: 10, scale: 2 }),
  altitude: numeric("altitude", { precision: 10, scale: 2 }),
  speed: numeric("speed", { precision: 10, scale: 2 }),
  heading: numeric("heading", { precision: 10, scale: 2 }),
  batteryLevel: integer("battery_level"),
  isMoving: boolean("is_moving"),
  trigger: gpsTriggerEnum("trigger"),
  deviceId: text("device_id"),
  appState: appStateEnum("app_state"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
