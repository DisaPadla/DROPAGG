import {
  calculateDiscountPercent,
  selectRepresentativeVariant,
  getProductDiscountInfo,
  formatCompareAtPrice,
  type ProductDiscountInfo,
} from "./currency";

export {
  calculateDiscountPercent,
  selectRepresentativeVariant,
  getProductDiscountInfo,
  formatCompareAtPrice,
  type ProductDiscountInfo,
};

export const DEFAULT_UTM_PARAMS = {
  utm_source: "dropagg",
  utm_medium: "aggregator",
} as const;

export interface OutboundClickPayload {
  productId?: string | null;
  brandId?: string | null;
  brandName?: string | null;
  targetUrl: string;
  source?: "catalog" | "local_catalog" | "brands_list" | string;
}

const DISALLOWED_SCHEME_REGEX = /^(javascript|data|vbscript|file|mailto|tel|blob):/i;

/**
 * Safely appends `?utm_source=dropagg&utm_medium=aggregator` (and any optional extra params)
 * to an outbound store or product URL while preserving existing query parameters and hashes.
 */
export function appendUtmParams(
  rawUrl: string | null | undefined,
  extraParams?: Record<string, string>
): string {
  if (!rawUrl || typeof rawUrl !== "string") {
    return "#";
  }

  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed === "#" || DISALLOWED_SCHEME_REGEX.test(trimmed)) {
    return "#";
  }

  const isRelativePath = trimmed.startsWith("/") && !trimmed.startsWith("//");

  const normalizedInput =
    trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? trimmed
      : trimmed.startsWith("//")
      ? `https:${trimmed}`
      : isRelativePath
      ? trimmed
      : `https://${trimmed}`;

  try {
    const parsed = isRelativePath
      ? new URL(normalizedInput, "https://dropagg.local")
      : new URL(normalizedInput);

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "#";
    }

    parsed.searchParams.set("utm_source", extraParams?.utm_source || DEFAULT_UTM_PARAMS.utm_source);
    parsed.searchParams.set("utm_medium", extraParams?.utm_medium || DEFAULT_UTM_PARAMS.utm_medium);

    if (extraParams) {
      for (const [key, value] of Object.entries(extraParams)) {
        if (key !== "utm_source" && key !== "utm_medium" && value) {
          parsed.searchParams.set(key, value);
        }
      }
    }

    if (isRelativePath) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }

    return parsed.toString();
  } catch {
    return "#";
  }
}

/**
 * Fires a non-blocking analytics event to `/api/clicks` when a user clicks an outbound link.
 */
export function trackOutboundClick(payload: OutboundClickPayload): void {
  if (typeof window === "undefined") return;
  if (!payload.targetUrl || payload.targetUrl === "#") return;

  const body = JSON.stringify({
    productId: payload.productId || null,
    brandId: payload.brandId || null,
    brandName: payload.brandName || null,
    targetUrl: payload.targetUrl,
    source: payload.source || "catalog",
  });

  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      const queued = navigator.sendBeacon("/api/clicks", blob);
      if (queued) return;
    }
  } catch {
    // Fallback to fetch below
  }

  fetch("/api/clicks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    // Non-blocking: ignore network errors in offline / local-first mode
  });
}
