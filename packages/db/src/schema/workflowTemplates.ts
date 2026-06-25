import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { businessTypeEnum } from "./enums";

export const workflowTemplates = pgTable("workflow_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessType: businessTypeEnum("business_type").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
