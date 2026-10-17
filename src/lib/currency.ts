export type DisplayCurrency = "UAH" | "USD" | "EUR";

export const SUPPORTED_DISPLAY_CURRENCIES: DisplayCurrency[] = ["UAH", "USD", "EUR"];

export const CURRENCY_SYMBOLS: Record<string, string> = {
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

/**
 * Fallback exchange rates relative to 1 USD (1 USD = X units of target currency).
 * Used for client-side display currency switching (UAH / USD / EUR) and as a fallback
 * during ingestion when the ExchangeRate table in PostgreSQL has not been populated yet.
 */
export const DEFAULT_EXCHANGE_RATES: Record<string, number> = {
  USD: 1,
  UAH: 41.5,
  EUR: 0.92,
  GBP: 0.79,
  PLN: 4.02,
  CAD: 1.38,
  AUD: 1.52,
  CHF: 0.88,
  JPY: 152.0,
  CNY: 7.24,
  KRW: 1380.0,
  SEK: 10.6,
  NOK: 10.9,
  DKK: 6.86,
  CZK: 23.3,
};

export const KNOWN_ISO_CURRENCIES = new Set<string>([
  "USD",
  "EUR",
  "UAH",
  "GBP",
  "PLN",
  "CAD",
  "AUD",
  "CHF",
  "JPY",
  "CNY",
  "KRW",
  "SEK",
  "NOK",
  "DKK",
  "CZK",
  "HUF",
  "TRY",
  "ILS",
  "BRL",
  "MXN",
  "INR",
  "SGD",
  "HKD",
  "NZD",
  "ZAR",
]);

export const CURRENCY_TO_COUNTRY: Record<string, string> = {
  UAH: "UA",
  USD: "US",
  EUR: "EU",
  GBP: "GB",
  PLN: "PL",
  CAD: "CA",
  AUD: "AU",
  CHF: "CH",
  JPY: "JP",
  CNY: "CN",
  KRW: "KR",
  SEK: "SE",
  NOK: "NO",
  DKK: "DK",
  CZK: "CZ",
};

export const COUNTRY_TO_CURRENCY: Record<string, string> = {
  UA: "UAH",
  US: "USD",
  GB: "GBP",
  UK: "GBP",
  PL: "PLN",
  CA: "CAD",
  AU: "AUD",
  CH: "CHF",
  JP: "JPY",
  CN: "CNY",
  KR: "KRW",
  SE: "SEK",
  NO: "NOK",
  DK: "DKK",
  CZ: "CZK",
  EU: "EUR",
  DE: "EUR",
  FR: "EUR",
  IT: "EUR",
  ES: "EUR",
  NL: "EUR",
  BE: "EUR",
  AT: "EUR",
  PT: "EUR",
  IE: "EUR",
  FI: "EUR",
  GR: "EUR",
  LT: "EUR",
  LV: "EUR",
  EE: "EUR",
  SK: "EUR",
  SI: "EUR",
};

const SYMBOL_TO_CURRENCY: Record<string, string> = {
  "₴": "UAH",
  "ГРН": "UAH",
  "ГРН.": "UAH",
  "UAH": "UAH",
  "$": "USD",
  "US$": "USD",
  "USD": "USD",
  "€": "EUR",
  "EUR": "EUR",
  "£": "GBP",
  "GBP": "GBP",
  "ZŁ": "PLN",
  "PLN": "PLN",
};

export function normalizeCurrencyCode(raw?: string | null): string | null {
  if (!raw || typeof raw !== "string") return null;
  const cleaned = raw.trim().toUpperCase();
  if (!cleaned) return null;

  if (SYMBOL_TO_CURRENCY[cleaned]) {
    return SYMBOL_TO_CURRENCY[cleaned];
  }

  if (/^[A-Z]{3}$/.test(cleaned) && KNOWN_ISO_CURRENCIES.has(cleaned)) {
    return cleaned;
  }

  return null;
}

export function convertCurrency(
  amount: number,
  fromCurrency?: string | null,
  toCurrency?: string | null,
  customRates?: Record<string, number> | Map<string, number>
): number {
  if (!Number.isFinite(amount) || amount === 0) return 0;

  const from = (normalizeCurrencyCode(fromCurrency) || fromCurrency || "USD").trim().toUpperCase();
  const to = (normalizeCurrencyCode(toCurrency) || toCurrency || from).trim().toUpperCase();

  if (from === to) return amount;

  const getRate = (code: string): number => {
    if (code === "USD") return 1;
    if (customRates) {
      if (customRates instanceof Map) {
        const r = customRates.get(code);
        if (r && Number.isFinite(r) && r > 0) return r;
      } else if (typeof customRates === "object" && customRates[code] > 0) {
        return customRates[code];
      }
    }
    return DEFAULT_EXCHANGE_RATES[code] ?? 1;
  };

  const fromRate = getRate(from);
  const toRate = getRate(to);

  const amountInUsd = from === "USD" ? amount : amount / (fromRate || 1);
  const converted = to === "USD" ? amountInUsd : amountInUsd * (toRate || 1);

  return converted;
}

export function normalizePriceToUsd(
  amount: number,
  fromCurrency?: string | null,
  customRates?: Record<string, number> | Map<string, number>
): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const usd = convertCurrency(amount, fromCurrency || "USD", "USD", customRates);
  return Number(usd.toFixed(2));
}

export interface PriceableVariant {
  id?: string;
  size?: string | null;
  color?: string | null;
  availability?: string | null;
  rawPrice?: unknown;
  price?: unknown;
  compareAtPrice?: unknown;
  compare_at_price?: unknown;
  normalizedPrice?: unknown;
  currency?: string | null;
}

export interface PriceableProduct {
  id?: string;
  rawPrice?: unknown;
  price?: unknown;
  normalizedPrice?: unknown;
  currency?: string | null;
  brand?: {
    defaultCurrency?: string | null;
  } | null;
  variants?: PriceableVariant[] | null;
}

export interface ProductDiscountInfo {
  hasDiscount: boolean;
  discountPercent: number | null;
  rawPrice: number;
  compareAtPrice: number | null;
  normalizedPrice: number | null;
  normalizedCompareAtPrice: number | null;
  currency: string;
  compareAtProduct: PriceableProduct | null;
}

/**
 * Calculates integer discount percentage (e.g., 35 for -35%) when compareAtPrice > rawPrice.
 * Returns null if there is no valid discount.
 */
export function calculateDiscountPercent(
  rawPrice?: unknown,
  compareAtPrice?: unknown
): number | null {
  if (
    rawPrice === null ||
    rawPrice === undefined ||
    compareAtPrice === null ||
    compareAtPrice === undefined
  ) {
    return null;
  }

  const raw = typeof rawPrice === "number" ? rawPrice : parseFloat(String(rawPrice));
  const compare =
    typeof compareAtPrice === "number" ? compareAtPrice : parseFloat(String(compareAtPrice));

  if (!Number.isFinite(raw) || !Number.isFinite(compare) || raw <= 0 || compare <= raw) {
    return null;
  }

  const percent = Math.round(((compare - raw) / compare) * 100);
  if (percent < 1) return null;
  return Math.min(percent, 99);
}

/**
 * Selects a consistent representative variant for a product card so that
 * `formatProductPrice`, `getProductDiscountInfo`, and `formatCompareAtPrice`
 * always reference the exact same variant.
 */
export function selectRepresentativeVariant<T extends PriceableVariant = PriceableVariant>(
  variants?: T[] | null
): T | undefined {
  if (!Array.isArray(variants) || variants.length === 0) return undefined;

  const inStockVariants = variants.filter((v) => v && v.availability === "IN_STOCK");
  if (inStockVariants.length > 0) {
    const inStockDiscounted = inStockVariants.find(
      (v) =>
        calculateDiscountPercent(
          v?.rawPrice ?? v?.price,
          v?.compareAtPrice ?? v?.compare_at_price
        ) !== null
    );
    return inStockDiscounted || inStockVariants[0];
  }

  const anyDiscounted = variants.find(
    (v) =>
      v &&
      calculateDiscountPercent(
        v?.rawPrice ?? v?.price,
        v?.compareAtPrice ?? v?.compare_at_price
      ) !== null
  );
  return anyDiscounted || variants[0];
}

export function resolveVariantCurrency(
  variant?: PriceableVariant | null,
  brandDefaultCurrency?: string | null,
  fallbackCurrency?: string | null
): string {
  const rawVariantCurr =
    typeof variant?.currency === "string" ? variant.currency.trim().toUpperCase() : "";
  const rawBrandCurr =
    typeof brandDefaultCurrency === "string" ? brandDefaultCurrency.trim().toUpperCase() : "";
  const rawFallbackCurr =
    typeof fallbackCurrency === "string" ? fallbackCurrency.trim().toUpperCase() : "";

  const vCurr = normalizeCurrencyCode(rawVariantCurr) || rawVariantCurr;
  const bCurr = normalizeCurrencyCode(rawBrandCurr) || rawBrandCurr;
  const fCurr = normalizeCurrencyCode(rawFallbackCurr) || rawFallbackCurr;

  // If the brand's defaultCurrency was auto-healed to a non-USD currency (e.g. UAH, EUR, PLN, GBP)
  // while an existing variant still holds stale "USD", prefer the brand's real currency.
  if (bCurr && bCurr !== "USD" && (!vCurr || vCurr === "USD")) {
    return bCurr;
  }

  return vCurr || bCurr || fCurr || "USD";
}

export function getVariantPriceInUsd(
  variant?: PriceableVariant | null,
  brandDefaultCurrency?: string | null
): number {
  if (!variant) return 0;
  const rawPrice = Number(variant.rawPrice ?? variant.price ?? 0);
  const normPrice = Number(variant.normalizedPrice ?? 0);
  const curr = resolveVariantCurrency(variant, brandDefaultCurrency);

  if (rawPrice > 0 && curr !== "USD") {
    if (!normPrice || Math.abs(normPrice - rawPrice) < 0.01) {
      return normalizePriceToUsd(rawPrice, curr);
    }
    return normPrice;
  }
  return normPrice > 0 ? normPrice : rawPrice > 0 ? rawPrice : 0;
}

export function getProductPriceInUsd(product?: PriceableProduct | null): number {
  const brandCurr = product?.brand?.defaultCurrency;
  const variant = selectRepresentativeVariant(product?.variants);
  if (!variant) {
    const directRaw = Number(product?.rawPrice ?? product?.price ?? 0);
    const directNorm = Number(product?.normalizedPrice ?? 0);
    if (directRaw > 0 || directNorm > 0) {
      return getVariantPriceInUsd(
        {
          rawPrice: directRaw,
          normalizedPrice: directNorm,
          currency: product?.currency || brandCurr,
        },
        brandCurr
      );
    }
    return 0;
  }
  return getVariantPriceInUsd(variant, brandCurr);
}

const CURRENCY_STORAGE_KEY = "dropagg_currency";
let activeDisplayCurrency: DisplayCurrency | null = null;
let isClientCurrencyHydrated = false;

export function isDisplayCurrency(val?: string | null): val is DisplayCurrency {
  if (!val) return false;
  const upper = val.trim().toUpperCase();
  return upper === "UAH" || upper === "USD" || upper === "EUR";
}

export function detectPreferredCurrency(): DisplayCurrency {
  if (activeDisplayCurrency) return activeDisplayCurrency;
  if (typeof window === "undefined") return "USD";

  try {
    const saved = localStorage.getItem(CURRENCY_STORAGE_KEY)?.trim().toUpperCase();
    if (isDisplayCurrency(saved)) {
      return saved;
    }

    const savedLang = localStorage.getItem("dropagg_lang");
    if (savedLang === "uk") return "UAH";
    if (savedLang === "en") return "USD";

    const navLang = (navigator.language || "").toLowerCase();
    if (navLang.startsWith("uk") || navLang.startsWith("ru")) {
      return "UAH";
    }
  } catch {
    // Ignore localStorage access errors in restricted environments
  }

  return "USD";
}

export function hydratePreferredCurrency(): DisplayCurrency {
  const detected = detectPreferredCurrency();
  activeDisplayCurrency = detected;
  isClientCurrencyHydrated = true;
  return detected;
}

export function getPreferredCurrency(): DisplayCurrency | null {
  if (activeDisplayCurrency) return activeDisplayCurrency;
  if (
    typeof window !== "undefined" &&
    (isClientCurrencyHydrated || typeof document === "undefined")
  ) {
    try {
      const saved = localStorage.getItem(CURRENCY_STORAGE_KEY)?.trim().toUpperCase();
      if (isDisplayCurrency(saved)) {
        return saved;
      }
    } catch {
      // Ignore storage error
    }
    return detectPreferredCurrency();
  }
  return null;
}

export function setPreferredCurrency(currency: DisplayCurrency | null): void {
  activeDisplayCurrency = currency ? (currency.trim().toUpperCase() as DisplayCurrency) : null;
  isClientCurrencyHydrated = Boolean(activeDisplayCurrency);
  if (typeof window !== "undefined") {
    try {
      if (activeDisplayCurrency) {
        localStorage.setItem(CURRENCY_STORAGE_KEY, activeDisplayCurrency);
      } else {
        localStorage.removeItem(CURRENCY_STORAGE_KEY);
      }
      window.dispatchEvent(new Event("dropagg_currency_change"));
    } catch {
      // Ignore storage error
    }
  }
}

export function formatProductPrice(
  rawPriceOrProduct?: number | string | PriceableProduct | null,
  currency?: string | null,
  brandCurrency?: string | null,
  targetCurrency?: DisplayCurrency | string | null
): string {
  if (rawPriceOrProduct === null || rawPriceOrProduct === undefined || rawPriceOrProduct === "") {
    return "";
  }

  let priceVal: number = 0;
  let sourceCurr: string = "";
  let explicitTargetCurr: string | null = targetCurrency ? String(targetCurrency) : null;

  if (typeof rawPriceOrProduct === "object") {
    const p = rawPriceOrProduct;
    const variant = selectRepresentativeVariant(p.variants);
    const hasVariant = Boolean(variant);

    const raw =
      variant?.rawPrice !== undefined && variant?.rawPrice !== null
        ? Number(variant.rawPrice)
        : variant?.price !== undefined && variant?.price !== null
        ? Number(variant.price)
        : p.rawPrice !== undefined && p.rawPrice !== null
        ? Number(p.rawPrice)
        : p.price !== undefined && p.price !== null
        ? Number(p.price)
        : null;

    const norm =
      variant?.normalizedPrice !== undefined && variant?.normalizedPrice !== null
        ? Number(variant.normalizedPrice)
        : p.normalizedPrice !== undefined && p.normalizedPrice !== null
        ? Number(p.normalizedPrice)
        : null;

    const hasOwnCurrency = Boolean(
      variant?.currency || p.currency || p.brand?.defaultCurrency || brandCurrency
    );
    const productSourceCurr = hasOwnCurrency
      ? resolveVariantCurrency(
          variant,
          p.brand?.defaultCurrency || brandCurrency,
          p.currency
        )
      : "";

    if (raw !== null && !Number.isNaN(raw) && (raw > 0 || norm === null || norm === 0)) {
      priceVal = raw;
      sourceCurr = productSourceCurr || currency || "USD";
    } else if (norm !== null && !Number.isNaN(norm)) {
      priceVal = norm;
      sourceCurr = "USD";
    } else if (!hasVariant) {
      return "";
    }

    // Support 2-arg call `formatProductPrice(product, "EUR")` where 2nd arg is display currency
    if (!explicitTargetCurr && currency && productSourceCurr) {
      explicitTargetCurr = currency;
    }
  } else {
    priceVal =
      typeof rawPriceOrProduct === "number" ? rawPriceOrProduct : Number(rawPriceOrProduct);
    sourceCurr = currency || brandCurrency || "USD";
  }

  if (Number.isNaN(priceVal) || (!priceVal && priceVal !== 0)) {
    return "";
  }

  const resolvedSource = (
    normalizeCurrencyCode(sourceCurr) ||
    sourceCurr ||
    brandCurrency ||
    "USD"
  )
    .trim()
    .toUpperCase();

  const preferred = explicitTargetCurr || getPreferredCurrency();
  const resolvedTarget = (
    preferred ? normalizeCurrencyCode(preferred) || preferred : resolvedSource
  )
    .trim()
    .toUpperCase();

  let finalPrice = priceVal;
  if (resolvedSource !== resolvedTarget && priceVal > 0) {
    const converted = convertCurrency(priceVal, resolvedSource, resolvedTarget);
    if (
      converted >= 10 ||
      resolvedTarget === "UAH" ||
      resolvedTarget === "PLN" ||
      resolvedTarget === "JPY" ||
      resolvedTarget === "KRW"
    ) {
      finalPrice = Math.round(converted);
    } else {
      finalPrice = Number(converted.toFixed(2));
    }
  } else {
    finalPrice = Number.isInteger(priceVal) ? priceVal : Number(priceVal.toFixed(2));
  }

  const code = resolvedTarget || "USD";

  if (code && CURRENCY_SYMBOLS[code]) {
    const symbol = CURRENCY_SYMBOLS[code];
    if (code === "UAH" || code === "PLN") return `${finalPrice} ${symbol}`;
    return `${symbol}${finalPrice}`;
  }

  if (code) {
    return `${finalPrice} ${code}`;
  }

  return `$${finalPrice}`;
}

/**
 * Extracts discount details (old price, current price, discount percentage) from a product's variants
 * using the same representative variant selection as `formatProductPrice`.
 */
export function getProductDiscountInfo(product?: PriceableProduct | null): ProductDiscountInfo {
  const defaultCurrency = product?.brand?.defaultCurrency || "USD";
  if (!product || !Array.isArray(product.variants) || product.variants.length === 0) {
    return {
      hasDiscount: false,
      discountPercent: null,
      rawPrice: 0,
      compareAtPrice: null,
      normalizedPrice: null,
      normalizedCompareAtPrice: null,
      currency: defaultCurrency,
      compareAtProduct: null,
    };
  }

  const variant = selectRepresentativeVariant(product.variants);

  const rawPrice = Number(variant?.rawPrice ?? variant?.price ?? variant?.normalizedPrice ?? 0);
  const rawCompareAt = variant?.compareAtPrice ?? variant?.compare_at_price;
  const compareAtPrice = rawCompareAt != null ? Number(rawCompareAt) : null;
  const discountPercent = calculateDiscountPercent(rawPrice, compareAtPrice);
  const hasDiscount =
    discountPercent !== null && compareAtPrice !== null && compareAtPrice > rawPrice;

  const normalizedPrice = variant?.normalizedPrice != null ? Number(variant.normalizedPrice) : null;
  const normalizedCompareAtPrice =
    hasDiscount && compareAtPrice !== null
      ? normalizedPrice && rawPrice > 0
        ? Number(((compareAtPrice / rawPrice) * normalizedPrice).toFixed(2))
        : compareAtPrice
      : null;

  const currency = resolveVariantCurrency(variant, defaultCurrency);

  const compareAtProduct: PriceableProduct | null =
    hasDiscount && compareAtPrice !== null
      ? {
          ...product,
          variants: [
            {
              ...variant,
              rawPrice: compareAtPrice,
              normalizedPrice: normalizedCompareAtPrice,
              currency,
            },
          ],
        }
      : null;

  return {
    hasDiscount,
    discountPercent,
    rawPrice,
    compareAtPrice: hasDiscount ? compareAtPrice : null,
    normalizedPrice,
    normalizedCompareAtPrice,
    currency,
    compareAtProduct,
  };
}

/**
 * Formats the crossed-out compareAtPrice using the same currency formatter as the active product price.
 */
export function formatCompareAtPrice(
  product?: PriceableProduct | null,
  currency?: string | null,
  brandCurrency?: string | null,
  targetCurrency?: DisplayCurrency | string | null
): string | null {
  const info = getProductDiscountInfo(product);
  if (!info.hasDiscount || !info.compareAtProduct) {
    return null;
  }
  return formatProductPrice(info.compareAtProduct, currency, brandCurrency, targetCurrency);
}
