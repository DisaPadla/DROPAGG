"use client";

import React, { createContext, useContext, useSyncExternalStore } from "react";
import { detectBrowserLanguage, setPreferredLanguage, TRANSLATIONS, Language } from "@/lib/i18n";
import {
  DisplayCurrency,
  hydratePreferredCurrency,
  setPreferredCurrency,
} from "@/lib/currency";

interface LanguageContextType {
  lang: Language;
  t: (typeof TRANSLATIONS)["uk"];
  setLanguage: (lang: Language) => void;
  currency: DisplayCurrency;
  setCurrency: (currency: DisplayCurrency) => void;
}

const LanguageContext = createContext<LanguageContextType>({
  lang: "uk",
  t: TRANSLATIONS.uk,
  setLanguage: () => {},
  currency: "UAH",
  setCurrency: () => {},
});

function subscribeLanguage(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("dropagg_lang_change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("dropagg_lang_change", callback);
  };
}

function subscribeCurrency(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("dropagg_lang_change", callback);
  window.addEventListener("dropagg_currency_change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("dropagg_lang_change", callback);
    window.removeEventListener("dropagg_currency_change", callback);
  };
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const lang = useSyncExternalStore<Language>(
    subscribeLanguage,
    () => detectBrowserLanguage(),
    () => "uk"
  );

  const currency = useSyncExternalStore<DisplayCurrency>(
    subscribeCurrency,
    () => hydratePreferredCurrency(),
    () => "UAH"
  );

  const handleSetLanguage = (newLang: Language) => {
    setPreferredLanguage(newLang);
    window.dispatchEvent(new Event("dropagg_lang_change"));
  };

  const handleSetCurrency = (newCurrency: DisplayCurrency) => {
    setPreferredCurrency(newCurrency);
  };

  const t = TRANSLATIONS[lang] || TRANSLATIONS.uk;

  return (
    <LanguageContext.Provider
      value={{
        lang,
        t,
        setLanguage: handleSetLanguage,
        currency,
        setCurrency: handleSetCurrency,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export function useCurrency() {
  const { currency, setCurrency } = useContext(LanguageContext);
  return { currency, setCurrency };
}
