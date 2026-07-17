import { index, integer, pgTable, text, timestamp, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { employees } from "./employees";

export const driveNodes = pgTable(
  "drive_nodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    parentId: uuid("parent_id").references((): AnyPgColumn => driveNodes.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    // 模块隔离:模块自建的顶层 root 打 scope(如 'case'/'mlk');宣传册(通用池)为 null。
    // 宣传册 drive 只显示 scope 为 null 的子树,模块 root 及其子树对宣传册不可见。
    scope: text("scope"),
    storagePath: text("storage_path"),
    mime: text("mime"),
    size: integer("size"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdBy: uuid("created_by").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBatch: uuid("deleted_batch")
  },
  (table) => ({
    parent: index("drive_nodes_parent_id_idx").on(table.parentId),
    deletedAt: index("drive_nodes_deleted_at_idx").on(table.deletedAt)
  })
);
