"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { detectBrowserLanguage, setPreferredLanguage, TRANSLATIONS, Language } from "@/lib/i18n";

interface LanguageContextType {
  lang: Language;
  t: (typeof TRANSLATIONS)["uk"];
  setLanguage: (lang: Language) => void;
}

const LanguageContext = createContext<LanguageContextType>({
  lang: "uk",
  t: TRANSLATIONS.uk,
  setLanguage: () => {},
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Language>("uk");

  useEffect(() => {
    const initialLang = detectBrowserLanguage();
    setLang(initialLang);

    const handleStorage = () => {
      const current = detectBrowserLanguage();
      setLang(current);
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("dropagg_lang_change", handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("dropagg_lang_change", handleStorage);
    };
  }, []);

  const handleSetLanguage = (newLang: Language) => {
    setLang(newLang);
    setPreferredLanguage(newLang);
    window.dispatchEvent(new Event("dropagg_lang_change"));
  };

  const t = TRANSLATIONS[lang] || TRANSLATIONS.uk;

  return (
    <LanguageContext.Provider value={{ lang, t, setLanguage: handleSetLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
