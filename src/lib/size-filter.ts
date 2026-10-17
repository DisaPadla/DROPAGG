import { getVariantPriceInUsd } from "./currency";

export const STANDARD_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "OS"] as const;

const SIZE_ORDER: Record<string, number> = {
  XXS: 0,
  XS: 1,
  S: 2,
  M: 3,
  L: 4,
  XL: 5,
  XXL: 6,
  XXXL: 7,
  "4XL": 8,
  OS: 9,
};

const ONE_SIZE_ALIASES = new Set([
  "OS",
  "O/S",
  "ONE SIZE",
  "ONESIZE",
  "ONE-SIZE",
  "OSFA",
  "OSFM",
  "DEFAULT",
  "DEFAULT TITLE",
  "FREE",
  "FREE SIZE",
  "UNIVERSAL",
  "УНІВЕРСАЛЬНИЙ",
  "ЄДИНИЙ",
  "ЄДИНИЙ РОЗМІР",
  "ОДИН РОЗМІР",
  "УНИВЕРСАЛЬНЫЙ",
  "ЕДИНЫЙ",
  "ЕДИНЫЙ РАЗМЕР",
]);

const SINGLE_TOKEN_ALIASES: Record<string, string> = {
  XXS: "XXS",
  "2XS": "XXS",
  "XX-SMALL": "XXS",
  "EXTRA EXTRA SMALL": "XXS",
  XS: "XS",
  "X-SMALL": "XS",
  XSMALL: "XS",
  "EXTRA SMALL": "XS",
  EXTRASMALL: "XS",
  S: "S",
  SM: "S",
  SMALL: "S",
  M: "M",
  MD: "M",
  MED: "M",
  MEDIUM: "M",
  L: "L",
  LG: "L",
  LRG: "L",
  LARGE: "L",
  XL: "XL",
  "X-LARGE": "XL",
  XLARGE: "XL",
  "EXTRA LARGE": "XL",
  EXTRALARGE: "XL",
  XXL: "XXL",
  "2XL": "XXL",
  "2X": "XXL",
  "XX-LARGE": "XXL",
  XXLARGE: "XXL",
  "EXTRA EXTRA LARGE": "XXL",
  XXXL: "XXXL",
  "3XL": "XXXL",
  "3X": "XXXL",
  "XXX-LARGE": "XXXL",
  XXXLARGE: "XXXL",
  "4XL": "4XL",
  "4X": "4XL",
  "XXXX-LARGE": "4XL",
  XXXXL: "4XL",
};

function stripSizePrefix(input: string): string {
  return input
    .trim()
    .replace(/^(?:SIZE|РОЗМІР|РАЗМЕР)\s*[:\-–—]?\s*/i, "")
    .trim();
}

function resolveKnownAlias(token: string): string | null {
  const clean = stripSizePrefix(token).toUpperCase();
  if (!clean) return null;
  if (ONE_SIZE_ALIASES.has(clean)) return "OS";
  if (SINGLE_TOKEN_ALIASES[clean]) return SINGLE_TOKEN_ALIASES[clean];
  return null;
}

function normalizeSingleToken(token: string): string | null {
  const clean = stripSizePrefix(token.toUpperCase());
  if (!clean) return null;

  const direct = resolveKnownAlias(clean);
  if (direct) return direct;

  // Handle parenthetical descriptions e.g. "L (LARGE)", "M (48-50)", "48-50 (M)", "One Size (Universal)", "42 (26.5 cm)"
  const parenMatch = clean.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (parenMatch) {
    const base = stripSizePrefix(parenMatch[1]);
    const inner = stripSizePrefix(parenMatch[2]);

    const baseAlias = resolveKnownAlias(base);
    if (baseAlias) return baseAlias;

    const innerAlias = resolveKnownAlias(inner);
    if (innerAlias) return innerAlias;

    if (base) return base;
  }

  return clean;
}

/**
 * Checks whether a normalized token represents a valid clothing/footwear/accessory size
 * (preventing accidental color names like "BLACK" or "OLIVE" from appearing as size filters).
 */
export function isValidSizeToken(token: string): boolean {
  if (!token) return false;
  const upper = token.trim().toUpperCase();
  if (upper in SIZE_ORDER) return true;

  // Numeric clothing / shoe sizes (e.g. "1".."60", "40.5", "10.5")
  if (/^\d{1,2}(\.\d)?$/.test(upper)) {
    const num = parseFloat(upper);
    return num >= 1 && num <= 62;
  }

  // Waist / length combinations (e.g. "W32", "30/32", "32X32")
  if (/^W\d{2}$/.test(upper) || /^\d{2}[\/X]\d{2}$/.test(upper)) {
    return true;
  }

  // Regional shoe/apparel sizes (e.g. "EU 42", "US 10.5", "UK 9")
  if (/^(EU|US|UK)\s*\d{1,2}(\.\d)?$/.test(upper)) {
    return true;
  }

  return false;
}

/**
 * Normalizes a raw variant size string into one or more canonical size tokens.
 * Examples:
 * - "Small" -> ["S"]
 * - "2XL" -> ["XXL"]
 * - "Default Title" / "One Size" -> ["OS"]
 * - "S/M" or "S-M" -> ["S", "M"]
 * - "Size: L" / "Розмір: M" -> ["L"] / ["M"]
 * - "48-50 (M)" / "M (48-50)" -> ["M"]
 */
export function normalizeSize(rawSize?: string | null): string[] {
  if (!rawSize || typeof rawSize !== "string") return [];

  const trimmed = stripSizePrefix(rawSize);
  if (!trimmed) return [];

  const upper = trimmed.toUpperCase();

  // Check whole string first for known aliases (including hyphenated like X-LARGE or ONE-SIZE)
  const direct = resolveKnownAlias(upper);
  if (direct) {
    return [direct];
  }

  // Check if the string has a parenthetical suffix like "S/M (Oversize)", "X-Large (52-54)", or "48-50 (M)"
  const parenMatch = upper.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (parenMatch) {
    const base = stripSizePrefix(parenMatch[1]);
    const inner = stripSizePrefix(parenMatch[2]);

    const baseAlias = resolveKnownAlias(base);
    if (baseAlias) return [baseAlias];

    // Check if base is a slash/hyphen composite size like "S/M (Oversize)"
    if (base.includes("/") || base.includes("-")) {
      const sep = base.includes("/") ? "/" : "-";
      const parts = base
        .split(sep)
        .map((p) => normalizeSingleToken(p))
        .filter((p): p is string => Boolean(p));
      if (parts.length >= 2 && parts.every((p) => p in SIZE_ORDER)) {
        return Array.from(new Set(parts));
      }
    }

    const innerAlias = resolveKnownAlias(inner);
    if (innerAlias) return [innerAlias];

    const singleBase = normalizeSingleToken(base);
    return singleBase ? [singleBase] : [];
  }

  // Check slash-separated composite sizes like "S/M", "L / XL"
  if (upper.includes("/")) {
    const parts = upper
      .split("/")
      .map((p) => normalizeSingleToken(p))
      .filter((p): p is string => Boolean(p));
    if (parts.length > 0 && parts.every((p) => p in SIZE_ORDER)) {
      return Array.from(new Set(parts));
    }
  }

  // Check hyphen-separated composite letter sizes like "S-M", "M-L", "L-XL"
  if (upper.includes("-")) {
    const parts = upper
      .split("-")
      .map((p) => normalizeSingleToken(p))
      .filter((p): p is string => Boolean(p));
    if (parts.length === 2 && parts.every((p) => p in SIZE_ORDER)) {
      return Array.from(new Set(parts));
    }
  }

  const single = normalizeSingleToken(upper);
  return single ? [single] : [];
}

/**
 * Checks whether a single product variant matches the active size and stock filters.
 */
export function variantMatchesFilter(
  variant: {
    size?: string | null;
    availability?: string | null;
    normalizedPrice?: number | string | null;
    rawPrice?: number | string | null;
    currency?: string | null;
  },
  selectedSizes: string[] = [],
  inStockOnly: boolean = false,
  maxPrice?: number,
  brandDefaultCurrency?: string | null
): boolean {
  if (!variant) return false;

  const isAvailable = variant.availability === "IN_STOCK";

  // Both inStockOnly and selecting specific sizes require the variant to be IN_STOCK
  if ((inStockOnly || selectedSizes.length > 0) && !isAvailable) {
    return false;
  }

  // Check USD-normalized price constraint on the same variant if maxPrice is provided
  if (maxPrice !== undefined && maxPrice > 0) {
    const usdPrice = getVariantPriceInUsd(variant, brandDefaultCurrency);
    if (usdPrice > maxPrice) {
      return false;
    }
  }

  if (selectedSizes.length === 0) {
    return true;
  }

  const normalizedTargets = new Set(
    selectedSizes.flatMap((s) => normalizeSize(s))
  );
  const variantSizes = normalizeSize(variant.size);

  return variantSizes.some((vs) => normalizedTargets.has(vs));
}

/**
 * Checks if a specific variant matches any of the selected sizes (for UI badge highlighting).
 */
export function isVariantSizeSelected(
  rawVariantSize: string | null | undefined,
  selectedSizes: string[] = []
): boolean {
  if (!rawVariantSize || selectedSizes.length === 0) return false;
  const normalizedTargets = new Set(selectedSizes.flatMap((s) => normalizeSize(s)));
  return normalizeSize(rawVariantSize).some((vs) => normalizedTargets.has(vs));
}

/**
 * Filters a list of products by selected sizes, in-stock status, and/or maxPrice (in USD).
 * When sizes are selected, a product only matches if it has at least one variant
 * of that size with `availability === "IN_STOCK"`.
 */
export function filterProductsBySizeAndStock<
  T extends {
    brand?: { defaultCurrency?: string | null } | null;
    variants?: Array<{
      size?: string | null;
      availability?: string | null;
      normalizedPrice?: number | string | null;
      rawPrice?: number | string | null;
      currency?: string | null;
    }> | null;
  }
>(
  products: T[],
  selectedSizes: string[] = [],
  inStockOnly: boolean = false,
  maxPrice?: number
): T[] {
  const cleanSizes = selectedSizes.map((s) => s.trim()).filter(Boolean);
  const hasMaxPrice = maxPrice !== undefined && maxPrice > 0;
  if (cleanSizes.length === 0 && !inStockOnly && !hasMaxPrice) {
    return products;
  }

  return products.filter((product) => {
    const variants = product.variants;
    if (!Array.isArray(variants) || variants.length === 0) {
      return false;
    }
    const brandDefaultCurrency = product.brand?.defaultCurrency;
    return variants.some((v) =>
      variantMatchesFilter(v, cleanSizes, inStockOnly, maxPrice, brandDefaultCurrency)
    );
  });
}

/**
 * Returns the representative USD-normalized price of a product for sorting, preferring matching
 * in-stock variants when size or stock filters are active.
 */
export function getEffectiveProductPrice(
  product: {
    brand?: { defaultCurrency?: string | null } | null;
    variants?: Array<{
      size?: string | null;
      availability?: string | null;
      normalizedPrice?: number | string | null;
      rawPrice?: number | string | null;
      currency?: string | null;
    }> | null;
  },
  selectedSizes: string[] = [],
  inStockOnly: boolean = false
): number {
  const variants = product?.variants;
  if (!Array.isArray(variants) || variants.length === 0) return 0;

  const brandDefaultCurrency = product?.brand?.defaultCurrency;
  const cleanSizes = selectedSizes.map((s) => s.trim()).filter(Boolean);
  const candidates =
    cleanSizes.length > 0 || inStockOnly
      ? variants.filter((v) =>
          variantMatchesFilter(v, cleanSizes, inStockOnly, undefined, brandDefaultCurrency)
        )
      : variants;

  const pool = candidates.length > 0 ? candidates : variants;
  const prices = pool
    .map((v) => getVariantPriceInUsd(v, brandDefaultCurrency))
    .filter((p) => Number.isFinite(p) && p > 0);

  return prices.length > 0 ? Math.min(...prices) : 0;
}

/**
 * Extracts and sorts canonical sizes available across products.
 * Always includes the core standard streetwear sizes so the filter grid stays consistent.
 */
export function extractAvailableSizes(
  products: Array<{
    variants?: Array<{ size?: string | null; availability?: string | null }> | null;
  }> = []
): string[] {
  const sizeSet = new Set<string>(STANDARD_SIZES);

  for (const product of products) {
    if (!Array.isArray(product.variants)) continue;
    for (const variant of product.variants) {
      if (variant.availability && variant.availability !== "IN_STOCK") {
        continue;
      }
      const normalized = normalizeSize(variant.size);
      for (const s of normalized) {
        if (s.length <= 6 && isValidSizeToken(s)) {
          sizeSet.add(s);
        }
      }
    }
  }

  return Array.from(sizeSet).sort((a, b) => {
    const orderA = SIZE_ORDER[a] ?? 100;
    const orderB = SIZE_ORDER[b] ?? 100;
    if (orderA !== orderB) return orderA - orderB;

    const numA = parseFloat(a);
    const numB = parseFloat(b);
    if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
      return numA - numB;
    }
    return a.localeCompare(b);
  });
}
