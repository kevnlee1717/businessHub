import { date, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { cases } from "./cases";
import { employees } from "./employees";

export const caseResubmissions = pgTable("case_resubmissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
  roundNo: integer("round_no").notNull(),
  requiredNote: text("required_note"),
  status: text("status").notNull().default("awaiting"),
  requestedAt: date("requested_at"),
  resubmittedAt: date("resubmitted_at"),
  createdBy: uuid("created_by").references(() => employees.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});
