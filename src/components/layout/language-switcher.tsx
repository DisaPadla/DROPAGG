"use client";

import { useLanguage } from "@/context/language-context";
import { Language } from "@/lib/i18n";

export function LanguageSwitcher() {
  const { lang, setLanguage } = useLanguage();

  const handleToggle = (newLang: Language) => {
    if (newLang === lang) return;
    setLanguage(newLang);
  };

  return (
    <div className="flex items-center gap-1 p-1 rounded-full border bg-muted/30 text-xs font-semibold">
      <button
        type="button"
        onClick={() => handleToggle("uk")}
        className={`px-2 py-1 rounded-full flex items-center gap-1 transition-all ${
          lang === "uk"
            ? "bg-primary text-primary-foreground font-bold shadow-sm"
            : "hover:bg-muted text-muted-foreground"
        }`}
        title="Українська мова (uk-UA)"
      >
        <span>🇺🇦</span>
        <span>UA</span>
      </button>

      <button
        type="button"
        onClick={() => handleToggle("en")}
        className={`px-2 py-1 rounded-full flex items-center gap-1 transition-all ${
          lang === "en"
            ? "bg-primary text-primary-foreground font-bold shadow-sm"
            : "hover:bg-muted text-muted-foreground"
        }`}
        title="English Language (en-US)"
      >
        <span>🇬🇧</span>
        <span>EN</span>
      </button>
    </div>
  );
}
