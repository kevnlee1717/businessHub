import { integer, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";
import { contractStatusEnum, contractSubjectTypeEnum } from "./enums";

export const contracts = pgTable("contracts", {
  id: uuid("id").primaryKey().defaultRandom(),
  subjectType: contractSubjectTypeEnum("subject_type").notNull(),
  subjectId: uuid("subject_id"),
  title: text("title").notNull(),
  partyInfo: text("party_info"),
  status: contractStatusEnum("status").notNull().default("draft"),
  currentVersionNo: integer("current_version_no").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});
