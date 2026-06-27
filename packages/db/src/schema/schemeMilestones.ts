import { integer, numeric, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { milestoneBasisEnum } from "./enums";
import { schemeVersions } from "./schemeVersions";

export const schemeMilestones = pgTable(
  "scheme_milestones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    versionId: uuid("version_id").notNull().references(() => schemeVersions.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    label: text("label").notNull(),
    basis: milestoneBasisEnum("basis").notNull(),
    value: numeric("value", { precision: 12, scale: 2 }).notNull(),
    bindStepOrder: integer("bind_step_order"),
    dueOffsetDays: integer("due_offset_days"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [unique("scheme_milestones_version_seq_unique").on(table.versionId, table.seq)]
);
