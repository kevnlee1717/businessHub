import { sql } from "drizzle-orm";
import { integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { roleEnum } from "./enums";
import { workflowTemplates } from "./workflowTemplates";

export const templateSteps = pgTable("template_steps", {
  id: uuid("id").primaryKey().defaultRandom(),
  templateId: uuid("template_id").notNull().references(() => workflowTemplates.id, { onDelete: "cascade" }),
  stepOrder: integer("step_order").notNull(),
  name: text("name").notNull(),
  nameEn: text("name_en"),
  description: text("description"),
  requiredDocuments: jsonb("required_documents").$type<{
    name: string;
    name_en?: string;
    category_id?: string | null;
    required: boolean;
  }[]>().notNull().default(sql`'[]'::jsonb`),
  defaultAssigneeRole: roleEnum("default_assignee_role"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
