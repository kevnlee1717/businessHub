import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { cases } from "./cases";
import { caseSubmissionResultEnum } from "./enums";

export const caseSubmissions = pgTable("case_submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  result: caseSubmissionResultEnum("result").notNull().default("pending"),
  rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
