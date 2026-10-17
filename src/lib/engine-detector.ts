/**
 * Engine & Store Locale Auto-Detector
 * Implements Tier 1 detection logic from the TDD to classify e-commerce backends
 * and automatically infer store currency (ISO 4217) and country (ISO 3166-1 alpha-2).
 */

import { PlatformType } from "@prisma/client";
import {
  COUNTRY_TO_CURRENCY,
  CURRENCY_TO_COUNTRY,
  normalizeCurrencyCode,
} from "./currency";

export interface DetectionResult {
  platform: PlatformType;
  confidence: number; // 0 to 1
  feedUrl?: string;
  reason?: string;
  currency: string;
  country: string;
}

export interface StoreLocaleResult {
  currency: string;
  country: string;
  source: string;
}

const TLD_TO_LOCALE: Array<{ suffix: string; country: string; currency: string }> = [
  { suffix: ".com.ua", country: "UA", currency: "UAH" },
  { suffix: ".kyiv.ua", country: "UA", currency: "UAH" },
  { suffix: ".kiev.ua", country: "UA", currency: "UAH" },
  { suffix: ".lviv.ua", country: "UA", currency: "UAH" },
  { suffix: ".ua", country: "UA", currency: "UAH" },
  { suffix: ".com.pl", country: "PL", currency: "PLN" },
  { suffix: ".pl", country: "PL", currency: "PLN" },
  { suffix: ".co.uk", country: "GB", currency: "GBP" },
  { suffix: ".org.uk", country: "GB", currency: "GBP" },
  { suffix: ".uk", country: "GB", currency: "GBP" },
  { suffix: ".de", country: "DE", currency: "EUR" },
  { suffix: ".fr", country: "FR", currency: "EUR" },
  { suffix: ".it", country: "IT", currency: "EUR" },
  { suffix: ".es", country: "ES", currency: "EUR" },
  { suffix: ".nl", country: "NL", currency: "EUR" },
  { suffix: ".be", country: "BE", currency: "EUR" },
  { suffix: ".at", country: "AT", currency: "EUR" },
  { suffix: ".pt", country: "PT", currency: "EUR" },
  { suffix: ".ie", country: "IE", currency: "EUR" },
  { suffix: ".fi", country: "FI", currency: "EUR" },
  { suffix: ".eu", country: "EU", currency: "EUR" },
  { suffix: ".ch", country: "CH", currency: "CHF" },
  { suffix: ".ca", country: "CA", currency: "CAD" },
  { suffix: ".com.au", country: "AU", currency: "AUD" },
  { suffix: ".au", country: "AU", currency: "AUD" },
  { suffix: ".co.jp", country: "JP", currency: "JPY" },
  { suffix: ".jp", country: "JP", currency: "JPY" },
  { suffix: ".co.kr", country: "KR", currency: "KRW" },
  { suffix: ".kr", country: "KR", currency: "KRW" },
  { suffix: ".cz", country: "CZ", currency: "CZK" },
  { suffix: ".se", country: "SE", currency: "SEK" },
  { suffix: ".no", country: "NO", currency: "NOK" },
  { suffix: ".dk", country: "DK", currency: "DKK" },
];

export function extractLocaleFromDomain(domainUrl: string): {
  country: string | null;
  currency: string | null;
} {
  try {
    const clean = domainUrl.trim().startsWith("http")
      ? domainUrl.trim()
      : `https://${domainUrl.trim()}`;
    const hostname = new URL(clean).hostname.toLowerCase().replace(/^www\./, "");

    for (const entry of TLD_TO_LOCALE) {
      if (hostname.endsWith(entry.suffix)) {
        return { country: entry.country, currency: entry.currency };
      }
    }
  } catch {
    // Ignore URL parse error
  }
  return { country: null, currency: null };
}

/**
 * Synchronous extraction of currency and country from cookies/headers, HTML content, and domain TLD.
 */
export function detectLocaleFromStaticSignals(
  domainUrl: string,
  html?: string,
  cookieHeader?: string,
  headers?: Headers
): { currency: string | null; country: string | null; source?: string } {
  let currency: string | null = null;
  let country: string | null = null;
  let source: string | undefined;

  // 1. Headers & Cookies (cart_currency, localization, etc.)
  const headersWithSetCookie = headers as (Headers & { getSetCookie?: () => string[] }) | undefined;
  const combinedCookies = [
    cookieHeader || "",
    headers?.get("set-cookie") || "",
    typeof headersWithSetCookie?.getSetCookie === "function"
      ? headersWithSetCookie.getSetCookie().join("; ")
      : "",
  ]
    .filter(Boolean)
    .join("; ");

  const headerCurr =
    headers?.get("x-shop-currency") ||
    headers?.get("x-currency") ||
    headers?.get("x-store-currency");
  if (headerCurr) {
    const norm = normalizeCurrencyCode(headerCurr);
    if (norm) {
      currency = norm;
      source = "Header (x-currency)";
    }
  }

  if (combinedCookies) {
    const cartCurrMatch = combinedCookies.match(
      /\b(?:cart_currency|woocommerce_current_currency|wc_currency|shop_currency|currency)=([A-Za-z]{3})\b/i
    );
    if (cartCurrMatch && !currency) {
      const norm = normalizeCurrencyCode(cartCurrMatch[1]);
      if (norm) {
        currency = norm;
        source = "Cookie (cart_currency)";
      }
    }

    const locMatch = combinedCookies.match(
      /\b(?:localization|cart_country|country_code)=([A-Za-z]{2})(?:%3B|;|,|$|\s)/i
    );
    if (locMatch) {
      const code = locMatch[1].toUpperCase();
      if (/^[A-Z]{2}$/.test(code)) {
        country = code;
      }
    }
  }

  // 2. HTML / DOM Signatures
  if (html) {
    // 2a. Shopify.currency = {"active":"UAH"} or Shopify.country = "UA"
    if (!currency) {
      const shopifyCurrMatch =
        html.match(/Shopify\.currency\s*=\s*\{[^}]*["']active["']\s*:\s*["']([A-Za-z]{3})["']/i) ||
        html.match(/["'](?:shopCurrency|currencyCode|cartCurrency)["']\s*:\s*["']([A-Za-z]{3})["']/i);
      if (shopifyCurrMatch) {
        const norm = normalizeCurrencyCode(shopifyCurrMatch[1]);
        if (norm) {
          currency = norm;
          source = source || "HTML (Shopify.currency)";
        }
      }
    }

    if (!country) {
      const shopifyCountryMatch = html.match(
        /Shopify\.country\s*=\s*["']([A-Za-z]{2})["']/i
      );
      if (shopifyCountryMatch) {
        const code = shopifyCountryMatch[1].toUpperCase();
        if (/^[A-Z]{2}$/.test(code)) {
          country = code;
        }
      }
    }

    // 2b. Meta tags (og:price:currency, product:price:currency, itemprop="priceCurrency")
    if (!currency) {
      const metaCurrMatch =
        html.match(
          /<meta[^>]+(?:property|name|itemprop)=["'](?:og:price:currency|product:price:currency|priceCurrency|currency)["'][^>]+content=["']([A-Za-z]{3})["']/i
        ) ||
        html.match(
          /<meta[^>]+content=["']([A-Za-z]{3})["'][^>]+(?:property|name|itemprop)=["'](?:og:price:currency|product:price:currency|priceCurrency|currency)["']/i
        );
      if (metaCurrMatch) {
        const norm = normalizeCurrencyCode(metaCurrMatch[1]);
        if (norm) {
          currency = norm;
          source = source || "HTML (Meta Currency)";
        }
      }
    }

    // 2c. JSON-LD priceCurrency
    if (!currency) {
      const jsonLdMatch = html.match(/["']priceCurrency["']\s*:\s*["']([A-Za-z]{3})["']/i);
      if (jsonLdMatch) {
        const norm = normalizeCurrencyCode(jsonLdMatch[1]);
        if (norm) {
          currency = norm;
          source = source || "HTML (JSON-LD priceCurrency)";
        }
      }
    }

    // 2d. Tilda / WooCommerce / Custom attributes
    if (!currency) {
      const attrMatch =
        html.match(/data-(?:tilda-)?currency=["']([A-Za-z]{3})["']/i) ||
        html.match(/["']currency(?:_code)?["']\s*:\s*["']([A-Za-z]{3})["']/i);
      if (attrMatch) {
        const norm = normalizeCurrencyCode(attrMatch[1]);
        if (norm) {
          currency = norm;
          source = source || "HTML (Store Config Currency)";
        }
      }
    }

    // 2e. OpenGraph locale or <html lang="uk-UA">
    // Note: Generic `en-US` / `en_US` template defaults are treated as low-priority fallback
    // so they never override explicit ccTLDs (.com.ua, .pl, .de) or non-USD store currencies (UAH -> UA).
    let weakHtmlCountry: string | null = null;

    if (!country) {
      const ogLocaleMatch =
        html.match(/<meta[^>]+property=["']og:locale["'][^>]+content=["']([a-z]{2})[_-]([A-Z]{2})["']/i) ||
        html.match(/<meta[^>]+content=["']([a-z]{2})[_-]([A-Z]{2})["'][^>]+property=["']og:locale["']/i);
      if (ogLocaleMatch) {
        const lang = ogLocaleMatch[1].toLowerCase();
        const region = ogLocaleMatch[2].toUpperCase();
        if (lang === "en" && region === "US") {
          weakHtmlCountry = "US";
        } else {
          country = region;
        }
      }
    }

    if (!country) {
      const htmlLangMatch = html.match(
        /<html[^>]*\blang=["']([a-zA-Z]{2})(?:[-_]([a-zA-Z]{2}))?["']/i
      );
      if (htmlLangMatch) {
        const lang = htmlLangMatch[1].toLowerCase();
        const region = htmlLangMatch[2]?.toUpperCase();
        if (region && /^[A-Z]{2}$/.test(region)) {
          if (lang === "en" && region === "US") {
            weakHtmlCountry = weakHtmlCountry || "US";
          } else {
            country = region;
          }
        } else if (lang === "uk") {
          country = "UA";
        } else if (lang === "pl") {
          country = "PL";
        }
      }
    }

    // 2f. Visible currency symbols in HTML if no ISO code was detected yet
    if (!currency) {
      if (html.includes("₴") || /(?:^|\s|\d)грн\.?(?:\s|<|$)/i.test(html)) {
        currency = "UAH";
        source = source || "HTML (Symbol UAH)";
      } else if (/(?:^|\s|\d)zł(?:\s|<|$)/i.test(html)) {
        currency = "PLN";
        source = source || "HTML (Symbol PLN)";
      } else if (html.includes("€")) {
        currency = "EUR";
        source = source || "HTML (Symbol EUR)";
      } else if (html.includes("£")) {
        currency = "GBP";
        source = source || "HTML (Symbol GBP)";
      }
    }

    // Apply weak en-US country only if no ccTLD and no non-USD currency was detected
    const domainCheck = extractLocaleFromDomain(domainUrl);
    if (!country && !domainCheck.country && (!currency || currency === "USD") && weakHtmlCountry) {
      country = weakHtmlCountry;
    }
  }

  // 3. Domain TLD Heuristics
  const domainLocale = extractLocaleFromDomain(domainUrl);
  if (!country && domainLocale.country) {
    country = domainLocale.country;
  }
  if (!currency && domainLocale.currency) {
    currency = domainLocale.currency;
    source = source || "Domain TLD";
  }

  return { currency, country, source };
}

/**
 * Probes /meta.json (and /cart.js) and combines with static HTML/Cookie/TLD signals
 * to determine the real store currency and base country.
 */
export async function detectStoreLocale(
  domainUrl: string,
  html?: string,
  headers?: Headers
): Promise<StoreLocaleResult> {
  const url = domainUrl.startsWith("http") ? domainUrl : `https://${domainUrl}`;
  let origin = url;
  try {
    origin = new URL(url).origin;
  } catch {
    // Keep url as origin fallback
  }

  // Start with static signals from homepage response (if html/headers were passed) and TLD
  const staticSignals = detectLocaleFromStaticSignals(origin, html, undefined, headers);
  let currency = staticSignals.currency;
  let country = staticSignals.country;
  let source = staticSignals.source || "Fallback";

  // 1. Probe /meta.json (authoritative for Shopify stores)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const metaRes = await fetch(`${origin}/meta.json`, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const metaHeaderSignals = detectLocaleFromStaticSignals(
      origin,
      undefined,
      undefined,
      metaRes.headers
    );
    if (!currency && metaHeaderSignals.currency) {
      currency = metaHeaderSignals.currency;
      source = metaHeaderSignals.source || "Header (/meta.json)";
    }
    if (!country && metaHeaderSignals.country) {
      country = metaHeaderSignals.country;
    }

    if (metaRes.ok && metaRes.headers.get("content-type")?.includes("json")) {
      const meta = await metaRes.json();
      const metaCurr = normalizeCurrencyCode(
        meta?.currency || meta?.shop_currency || meta?.currency_code
      );
      if (metaCurr) {
        currency = metaCurr;
        source = "/meta.json";
      }
      const rawCountry = String(meta?.country || meta?.country_code || "")
        .trim()
        .toUpperCase();
      if (/^[A-Z]{2}$/.test(rawCountry)) {
        country = rawCountry;
      }
    }
  } catch {
    // /meta.json not available or timed out — continue with other signals
  }

  // 2. If still no currency, try /cart.js (lightweight Shopify cart endpoint)
  if (!currency) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);
      const cartRes = await fetch(`${origin}/cart.js`, {
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          Accept: "application/json",
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const cartHeaderSignals = detectLocaleFromStaticSignals(
        origin,
        undefined,
        undefined,
        cartRes.headers
      );
      if (!country && cartHeaderSignals.country) {
        country = cartHeaderSignals.country;
      }

      if (cartRes.ok) {
        const cartText = await cartRes.text();
        const cartData = JSON.parse(cartText);
        const cartCurr = normalizeCurrencyCode(cartData?.currency);
        if (cartCurr) {
          currency = cartCurr;
          source = "/cart.js";
        }
      }
    } catch {
      // Ignore /cart.js probe failure
    }
  }

  // 3. If called standalone without html/headers and currency or country is still missing,
  // fetch homepage HTML & Set-Cookie headers to inspect DOM/meta/cookie signals
  if ((!currency || !country) && !html) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const homeRes = await fetch(origin, {
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (homeRes.ok) {
        const homeHtml = await homeRes.text();
        const homeSignals = detectLocaleFromStaticSignals(
          origin,
          homeHtml,
          undefined,
          homeRes.headers
        );
        if (!currency && homeSignals.currency) {
          currency = homeSignals.currency;
          source = homeSignals.source || "Homepage HTML";
        }
        if (!country && homeSignals.country) {
          country = homeSignals.country;
        }
      }
    } catch {
      // Ignore homepage fallback fetch failure
    }
  }

  // 4. Cross-infer missing half of (currency, country)
  if (currency && (!country || (country === "US" && currency !== "USD" && !extractLocaleFromDomain(origin).country))) {
    country = CURRENCY_TO_COUNTRY[currency] || country || "US";
  } else if (country && !currency) {
    currency = COUNTRY_TO_CURRENCY[country] || "USD";
    source = source === "Fallback" ? `Country (${country})` : source;
  }

  return {
    currency: currency || "USD",
    country: country || "US",
    source,
  };
}

export async function detectEngine(domainUrl: string): Promise<DetectionResult> {
  // Ensure we have a clean origin URL without trailing slashes
  const rawUrl = domainUrl.trim().startsWith("http")
    ? domainUrl.trim()
    : `https://${domainUrl.trim()}`;
  let url = rawUrl.replace(/\/+$/, "");
  try {
    url = new URL(rawUrl).origin;
  } catch {
    // Keep stripped url fallback
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    // Step 1: Initial GET Request (Homepage)
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const headers = response.headers;
    const text = await response.text();

    // Detect store currency & country in parallel with platform classification
    const localePromise = detectStoreLocale(url, text, headers);

    // Step 2: Header Analysis (Fastest & Most Reliable)
    const serverHeader = headers.get("server")?.toLowerCase() || "";
    const xShopId = headers.get("x-shopid");
    const setCookie = headers.get("set-cookie") || "";

    if (serverHeader.includes("cloudflare") && (xShopId || setCookie.includes("_shopify_y"))) {
      const locale = await localePromise;
      return {
        platform: "SHOPIFY",
        confidence: 0.9,
        feedUrl: `${url}/products.json?limit=250`,
        reason: "Header Match (Shopify)",
        currency: locale.currency,
        country: locale.country,
      };
    }

    // WooCommerce Check
    const xPoweredBy = headers.get("x-powered-by")?.toLowerCase() || "";
    if (xPoweredBy.includes("woocommerce")) {
      const locale = await localePromise;
      return {
        platform: "WOOCOMMERCE",
        confidence: 0.9,
        feedUrl: `${url}/wp-json/wc/v3/products`,
        reason: "Header Match (WooCommerce)",
        currency: locale.currency,
        country: locale.country,
      };
    }

    // Step 3: DOM Signatures / Script Variables
    if (text.includes("window.Shopify") || text.includes("cdn.shopify.com")) {
      const locale = await localePromise;
      return {
        platform: "SHOPIFY",
        confidence: 0.8,
        feedUrl: `${url}/products.json?limit=250`,
        reason: "DOM Match (Shopify)",
        currency: locale.currency,
        country: locale.country,
      };
    }

    if (
      text.includes('<meta name="generator" content="WooCommerce') ||
      text.includes('class="woocommerce')
    ) {
      const locale = await localePromise;
      return {
        platform: "WOOCOMMERCE",
        confidence: 0.8,
        feedUrl: `${url}/wp-json/wc/v3/products`,
        reason: "DOM Match (WooCommerce)",
        currency: locale.currency,
        country: locale.country,
      };
    }

    if (text.includes("tilda-blocks") || text.includes("static.tildacdn.com")) {
      const locale = await localePromise;
      return {
        platform: "TILDA",
        confidence: 0.8,
        reason: "DOM Match (Tilda)",
        currency: locale.currency,
        country: locale.country,
      };
    }

    if (
      text.includes("index.php?route=product/product") ||
      text.includes("catalog/view/theme/")
    ) {
      const locale = await localePromise;
      return {
        platform: "OPENCART",
        confidence: 0.7,
        reason: "DOM Match (OpenCart)",
        currency: locale.currency,
        country: locale.country,
      };
    }

    // Step 4: Feed Probing (Verification)
    try {
      const shopifyProbe = await fetch(`${url}/products.json?limit=1`, { method: "HEAD" });
      if (
        shopifyProbe.ok &&
        shopifyProbe.headers.get("content-type")?.includes("application/json")
      ) {
        const locale = await localePromise;
        return {
          platform: "SHOPIFY",
          confidence: 0.95,
          feedUrl: `${url}/products.json?limit=250`,
          reason: "Probe Match (Shopify)",
          currency: locale.currency,
          country: locale.country,
        };
      }
    } catch {
      // Ignore probe failure
    }

    // Step 5: Fallback (CUSTOM)
    const locale = await localePromise;
    return {
      platform: "CUSTOM",
      confidence: 1.0,
      reason: "No known signatures detected",
      currency: locale.currency,
      country: locale.country,
    };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Detector] Error scanning ${domainUrl}:`, errMsg);
    const staticFallback = detectLocaleFromStaticSignals(url);
    const currency =
      staticFallback.currency ||
      (staticFallback.country ? COUNTRY_TO_CURRENCY[staticFallback.country] : null) ||
      "USD";
    const country =
      staticFallback.country ||
      (staticFallback.currency ? CURRENCY_TO_COUNTRY[staticFallback.currency] : null) ||
      "US";

    return {
      platform: "CUSTOM",
      confidence: 0,
      reason: `Scan failed: ${error instanceof Error ? error.message : String(error)}`,
      currency,
      country,
    };
  }
}
