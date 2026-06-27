import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { dealParties } from "./dealParties";

export const externalParties = pgTable("external_parties", {
  id: uuid("id").primaryKey().defaultRandom(),
  partyId: uuid("party_id").references(() => dealParties.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  nameEn: text("name_en"),
  contact: text("contact"),
  note: text("note"),
  active: boolean("active").notNull().default(true),
  statementToken: text("statement_token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
