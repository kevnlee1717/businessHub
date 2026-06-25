import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { caseSteps } from "./caseSteps";
import { documents } from "./documents";
import { caseStepDocStatusEnum } from "./enums";

export const caseStepDocuments = pgTable("case_step_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseStepId: uuid("case_step_id").notNull().references(() => caseSteps.id, { onDelete: "cascade" }),
  docName: text("doc_name").notNull(),
  docNameEn: text("doc_name_en"),
  isRequired: boolean("is_required").notNull().default(true),
  status: caseStepDocStatusEnum("status").notNull().default("missing"),
  documentId: uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
