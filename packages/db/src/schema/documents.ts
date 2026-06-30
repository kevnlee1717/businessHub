import { integer, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { pgTable } from "drizzle-orm/pg-core";
import { documentCategories } from "./documentCategories";
import { employees } from "./employees";

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  storagePath: text("storage_path").notNull(),
  filename: varchar("filename", { length: 255 }).notNull(),
  mime: varchar("mime", { length: 255 }).notNull(),
  size: integer("size").notNull(),
  uploadedBy: uuid("uploaded_by").references(() => employees.id, { onDelete: "set null" }),
  subjectType: text("subject_type").notNull(),
  subjectId: uuid("subject_id"),
  // 公司内部文件库的归属路径,如 "合同&发票/EP";业务文档为 null。
  folderPath: text("folder_path"),
  // 文件库里可选的所属月份(YYYY-MM),目前用于工资 tab。
  period: varchar("period", { length: 7 }),
  clientId: uuid("client_id"),
  categoryId: uuid("category_id").references(() => documentCategories.id, { onDelete: "set null" }),
  tags: text("tags").array().notNull().default(sql`ARRAY[]::text[]`),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow()
});
