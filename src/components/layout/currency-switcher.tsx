"use client";

import { useLanguage } from "@/context/language-context";
import { DisplayCurrency, SUPPORTED_DISPLAY_CURRENCIES, CURRENCY_SYMBOLS } from "@/lib/currency";

const CURRENCY_LABELS: Record<DisplayCurrency, { label: string; title: string }> = {
  UAH: { label: "UAH", title: "Українська гривня (₴ UAH)" },
  USD: { label: "USD", title: "US Dollar ($ USD)" },
  EUR: { label: "EUR", title: "Euro (€ EUR)" },
};

export function CurrencySwitcher() {
  const { currency, setCurrency } = useLanguage();

  const handleToggle = (newCurr: DisplayCurrency) => {
    if (newCurr === currency) return;
    setCurrency(newCurr);
  };

  return (
    <div
      className="flex items-center gap-0.5 p-1 rounded-full border bg-muted/30 text-xs font-semibold"
      role="group"
      aria-label="Display Currency Switcher"
    >
      {SUPPORTED_DISPLAY_CURRENCIES.map((code) => {
        const isActive = currency === code;
        const symbol = CURRENCY_SYMBOLS[code] || "";
        const meta = CURRENCY_LABELS[code];

        return (
          <button
            key={code}
            type="button"
            onClick={() => handleToggle(code)}
            className={`px-2 py-1 rounded-full flex items-center gap-1 transition-all ${
              isActive
                ? "bg-primary text-primary-foreground font-bold shadow-sm"
                : "hover:bg-muted text-muted-foreground"
            }`}
            title={meta.title}
          >
            <span className="opacity-85">{symbol}</span>
            <span>{meta.label}</span>
          </button>
        );
      })}
    </div>
  );
}
