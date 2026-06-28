import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * 中央翻译表:给任意实体的任意文本字段存中英双语。
 * 写时翻译(DeepL)→ 这里 upsert;读时按界面语言取对应版本。
 * 一张表支持所有字段,无需给每张业务表加列。
 */
export const translations = pgTable(
  "translations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    field: text("field").notNull(),
    textZh: text("text_zh"),
    textEn: text("text_en"),
    sourceLang: text("source_lang").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    uniq: uniqueIndex("translations_entity_field_uniq").on(
      table.entityType,
      table.entityId,
      table.field
    ),
    lookup: index("translations_lookup_idx").on(table.entityType, table.field)
  })
);
