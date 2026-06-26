import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { documents } from "./documents";
import { genderEnum } from "./enums";

export const guarantors = pgTable("guarantors", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  nric: text("nric"),
  gender: genderEnum("gender"),
  age: integer("age"),
  idCardDocumentId: uuid("id_card_document_id").references(() => documents.id, { onDelete: "set null" }),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});
