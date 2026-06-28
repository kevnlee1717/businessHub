import { env } from "../env";

const ENDPOINT = "https://api-free.deepl.com/v2/translate";

export type Lang = "zh" | "en";

/**
 * 调 DeepL,把 text 翻成 target 语言。
 * 返回 { text, sourceLang };无 key、空文本或失败时返回 null(调用方需容错)。
 */
export async function translateText(
  text: string,
  target: Lang
): Promise<{ text: string; sourceLang: Lang } | null> {
  const key = env.DEEPL_API_KEY;
  if (!key || !text.trim()) return null;
  try {
    const body = new URLSearchParams();
    body.set("text", text);
    body.set("target_lang", target === "zh" ? "ZH" : "EN");
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `DeepL-Auth-Key ${key}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      translations?: { text: string; detected_source_language: string }[];
    };
    const tr = data.translations?.[0];
    if (!tr) return null;
    const sourceLang: Lang = tr.detected_source_language.toUpperCase().startsWith("ZH")
      ? "zh"
      : "en";
    return { text: tr.text, sourceLang };
  } catch {
    return null;
  }
}

/**
 * 把一段用户输入补全成双语:检测源语种 → 翻出另一语种。
 * 返回 { zh, en, sourceLang };失败/无 key 时返回 null,调用方应回退为只存原文。
 */
export async function makeBilingual(
  text: string
): Promise<{ zh: string; en: string; sourceLang: Lang } | null> {
  if (!text.trim()) return null;
  // 含中日韩统一表意文字 → 视为中文,翻成英文;否则翻成中文
  const looksZh = /[一-鿿]/.test(text);
  const r = await translateText(text, looksZh ? "en" : "zh");
  if (!r) return null;
  return r.sourceLang === "zh"
    ? { zh: text, en: r.text, sourceLang: "zh" }
    : { zh: r.text, en: text, sourceLang: "en" };
}
