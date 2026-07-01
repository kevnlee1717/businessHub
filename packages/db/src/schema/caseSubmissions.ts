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
  // 本次提交的截图(单图)、申诉信(单文件),以及其它附件(多文件)
  screenshotDocumentId: uuid("screenshot_document_id"),
  appealDocumentId: uuid("appeal_document_id"),
  attachmentDocumentIds: uuid("attachment_document_ids").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
