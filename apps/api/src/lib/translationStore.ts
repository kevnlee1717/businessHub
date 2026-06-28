import { db, translations } from "@bh/db";
import { and, eq, inArray } from "drizzle-orm";
import { makeBilingual, type Lang } from "./translate";

/**
 * 写时翻译:把某实体字段的文本补全双语并 upsert。
 * 无 DeepL key 或翻译失败时静默跳过(只保留业务表原文),不阻塞主流程。
 */
export async function saveTranslation(
  entityType: string,
  entityId: string,
  field: string,
  text: string
): Promise<void> {
  const bi = await makeBilingual(text);
  if (!bi) return;
  await db
    .insert(translations)
    .values({
      entityType,
      entityId,
      field,
      textZh: bi.zh,
      textEn: bi.en,
      sourceLang: bi.sourceLang
    })
    .onConflictDoUpdate({
      target: [translations.entityType, translations.entityId, translations.field],
      set: { textZh: bi.zh, textEn: bi.en, sourceLang: bi.sourceLang, updatedAt: new Date() }
    });
}

export type TranslationValue = { zh: string | null; en: string | null; source_lang: Lang };

/** 读时附加:批量取一组实体某字段的翻译,返回 entityId → 译文 的 Map。 */
export async function getTranslations(
  entityType: string,
  field: string,
  ids: string[]
): Promise<Map<string, TranslationValue>> {
  const map = new Map<string, TranslationValue>();
  if (ids.length === 0) return map;
  const rows = await db
    .select()
    .from(translations)
    .where(
      and(
        eq(translations.entityType, entityType),
        eq(translations.field, field),
        inArray(translations.entityId, ids)
      )
    );
  for (const r of rows) {
    map.set(r.entityId, { zh: r.textZh, en: r.textEn, source_lang: r.sourceLang as Lang });
  }
  return map;
}
