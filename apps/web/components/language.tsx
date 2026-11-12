"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import {
  languageKey,
  languageOf,
  translate,
  type Language,
} from "@hikmah/ui-tokens/i18n";
type Context = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (text: string | number | null | undefined) => string;
};
const LanguageContext = createContext<Context>({
  language: "en",
  setLanguage: () => {},
  t: (text) => translate("en", text),
});
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, update] = useState<Language>("en");
  useEffect(() => {
    try {
      update(languageOf(localStorage.getItem(languageKey)));
    } catch {
      /* Preference is optional in private browsing. */
    }
    const changed = (e: StorageEvent) => {
      if (e.key === languageKey) update(languageOf(e.newValue));
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ur" ? "rtl" : "ltr";
  }, [language]);
  const setLanguage = useCallback((value: Language) => {
    update(value);
    try {
      localStorage.setItem(languageKey, value);
    } catch {
      /* Still works for this session. */
    }
  }, []);
  const t = useCallback(
    (text: string | number | null | undefined) => translate(language, text),
    [language],
  );
  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}
export const useI18n = () => useContext(LanguageContext);
export function LanguageSwitch() {
  const { language, setLanguage } = useI18n();
  return (
    <div
      className="language-switch"
      role="group"
      aria-label="Language / زبان"
      dir="ltr"
    >
      <button
        type="button"
        lang="en"
        aria-pressed={language === "en"}
        onClick={() => setLanguage("en")}
      >
        English
      </button>
      <button
        type="button"
        lang="ur"
        aria-pressed={language === "ur"}
        onClick={() => setLanguage("ur")}
      >
        اردو
      </button>
    </div>
  );
}
