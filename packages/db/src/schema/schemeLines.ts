import { integer, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { dealParties } from "./dealParties";
import { schemeLineBasisEnum, schemeLineKindEnum, schemeLineRecurrenceEnum } from "./enums";
import { schemeVersions } from "./schemeVersions";

export const schemeLines = pgTable("scheme_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  versionId: uuid("version_id").notNull().references(() => schemeVersions.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull().default(0),
  kind: schemeLineKindEnum("kind").notNull(),
  basis: schemeLineBasisEnum("basis").notNull(),
  recurrence: schemeLineRecurrenceEnum("recurrence").notNull(),
  partyId: uuid("party_id").references(() => dealParties.id, { onDelete: "set null" }),
  rate: numeric("rate", { precision: 12, scale: 3 }),
  unitLabel: text("unit_label"),
  inputKey: text("input_key"),
  label: text("label").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
