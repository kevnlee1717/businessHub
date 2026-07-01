import { boolean, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { documents } from "./documents";
import { genderEnum } from "./enums";

export const guarantors = pgTable("guarantors", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  nric: text("nric"),
  gender: genderEnum("gender"),
  age: integer("age"),
  idCardDocumentId: uuid("id_card_document_id").references(() => documents.id, { onDelete: "set null" }),
  // 是否客户自己找的担保人(true=客户自带,通常不给公司分成;false=公司提供)
  isClientOwn: boolean("is_client_own").notNull().default(false),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});
