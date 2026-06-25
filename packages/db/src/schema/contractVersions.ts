import { integer, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";
import { contracts } from "./contracts";
import { documents } from "./documents";
import { employees } from "./employees";
import { contractVersionStatusEnum } from "./enums";

export const contractVersions = pgTable(
  "contract_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contractId: uuid("contract_id").notNull().references(() => contracts.id, { onDelete: "cascade" }),
    versionNo: integer("version_no").notNull(),
    documentId: uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
    status: contractVersionStatusEnum("status").notNull().default("draft"),
    note: text("note"),
    createdBy: uuid("created_by").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("contract_versions_contract_version_unique").on(table.contractId, table.versionNo)
  ]
);
