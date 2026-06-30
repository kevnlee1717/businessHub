import { text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";
import { documents } from "./documents";
import { rentLocations } from "./rentLocations";

// 租房地点下的文件:月租付款(带 period 月份)或租约/押金/交税证明等资料(带 doc_tag)。
// 文件本体仍存在 documents 表,这里只做地点关联 + 月份/标签/付款日。
export const rentFiles = pgTable("rent_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  locationId: uuid("location_id")
    .notNull()
    .references(() => rentLocations.id, { onDelete: "cascade" }),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  period: varchar("period", { length: 7 }), // YYYY-MM,月租付款用
  docTag: text("doc_tag"), // 租约 / 押金 / 交税证明 / 其他,非月租资料用
  paidAt: timestamp("paid_at", { withTimezone: true }),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
