export type AppLang = "zh" | "en";
export type I18nValue = { zh?: string | null; en?: string | null } | undefined;

export function normalizeLang(language?: string | null): AppLang {
  return language?.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function pickLang(i18n: I18nValue, lang: AppLang): string {
  const current = i18n?.[lang]?.trim();
  if (current) return current;

  const fallback = i18n?.[lang === "zh" ? "en" : "zh"]?.trim();
  return fallback ?? "";
}

export function tField(row: any, field: string, lang: AppLang): string {
  const translated = pickLang(row?.[`${field}_i18n`], lang);
  if (translated) return translated;
  return row?.[field] ?? "";
}
