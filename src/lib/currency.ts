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
  rawPriceOrProduct?: number | any | null,
  currency?: string | null,
  brandCurrency?: string | null
): string {
  let priceVal: number = 0;
  let curr: string = currency || "";
  let bCurr: string = brandCurrency || "";

  if (rawPriceOrProduct && typeof rawPriceOrProduct === "object") {
    const p = rawPriceOrProduct;
    const variant = p.variants?.[0];
    priceVal = Number(variant?.rawPrice ?? variant?.normalizedPrice ?? 0);
    curr = variant?.currency || p.brand?.defaultCurrency || "";
    bCurr = p.brand?.defaultCurrency || "";
  } else {
    priceVal = typeof rawPriceOrProduct === "number" ? rawPriceOrProduct : Number(rawPriceOrProduct || 0);
  }

  if (!priceVal && priceVal !== 0) {
    return "";
  }

  const code = (curr || bCurr || "USD").trim().toUpperCase();

  if (code && CURRENCY_SYMBOLS[code]) {
    const symbol = CURRENCY_SYMBOLS[code];
    if (code === "UAH" || code === "PLN") return `${priceVal} ${symbol}`;
    return `${symbol}${priceVal}`;
  }

  if (code) {
    return `${priceVal} ${code}`;
  }

  return `$${priceVal}`;
}
