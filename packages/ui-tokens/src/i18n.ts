import { ur } from "./messages";
export type Language = "en" | "ur";
export const languageKey = "hikmah-language";
export function languageOf(value: unknown): Language {
  return value === "ur" ? "ur" : "en";
}
export function translate(
  language: Language,
  text: string | number | null | undefined,
): string {
  if (text == null) return "";
  const value = String(text);
  if (language === "en") return value;
  const key = value.trim();
  const translated = Object.hasOwn(ur, key) ? ur[key] : undefined;
  if (translated) return value.replace(key, () => translated);
  for (const [pattern, replacement] of patterns) {
    const match = pattern.exec(key);
    if (match)
      return value.replace(key, () =>
        replacement.replace(/\{(\d+)\}/g, (_, i) => match[Number(i) + 1]),
      );
  }
  return value;
}
// Only catalogue-owned templates are patterns. Uploaded names, reference rows,
// saved data, CSV headings, API enum values and academic policies are untouched.
const patterns: [RegExp, string][] = Object.entries(ur)
  .filter(([key]) => /\{\d+\}/.test(key))
  .sort(([a], [b]) => b.length - a.length)
  .map(([key, value]) => [
    new RegExp(
      "^" +
        key
          .split(/\{\d+\}/)
          .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
          .join("(.+?)") +
        "$",
    ),
    value,
  ]);
