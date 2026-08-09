const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  UAH: "₴",
  GBP: "£",
  JPY: "¥",
  PLN: "zł",
  CAD: "CA$",
  AUD: "AU$",
  CHF: "CHF",
  CNY: "¥",
  KRW: "₩",
};

export function formatProductPrice(
  rawPrice?: number | null,
  currency?: string | null,
  brandCurrency?: string | null
): string {
  const priceVal = typeof rawPrice === "number" ? rawPrice : Number(rawPrice || 0);

  if (!priceVal && priceVal !== 0) {
    return "Price 0";
  }

  const code = (currency || brandCurrency || "").trim().toUpperCase();

  if (code && CURRENCY_SYMBOLS[code]) {
    const symbol = CURRENCY_SYMBOLS[code];
    // Symbol positioning based on standard currency conventions
    if (code === "UAH") return `${priceVal} ${symbol}`;
    if (code === "PLN") return `${priceVal} ${symbol}`;
    return `${symbol}${priceVal}`;
  }

  if (code) {
    return `${priceVal} ${code}`;
  }

  return `Price ${priceVal}`;
}
