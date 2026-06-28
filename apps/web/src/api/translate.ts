import { api } from "./client";

export type TranslateTarget = "zh" | "en";

export async function translateText(text: string, target: TranslateTarget): Promise<string> {
  if (!text.trim()) return "";

  try {
    const data = await api<{ text?: string }>("/translate", {
      method: "POST",
      body: { text, target }
    });
    return data.text ?? "";
  } catch {
    return "";
  }
}
