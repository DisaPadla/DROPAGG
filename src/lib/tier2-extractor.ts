import * as cheerio from "cheerio";

export interface ExtractedProduct {
  title: string;
  description: string;
  mainImage: string;
  price?: number;
  compareAtPrice?: number;
  currency?: string;
  availability?: "IN_STOCK" | "OUT_OF_STOCK";
  url: string;
}

function parseAvailabilityStatus(raw?: string | null): "IN_STOCK" | "OUT_OF_STOCK" | undefined {
  if (!raw || typeof raw !== "string") return undefined;
  const normalized = raw.toLowerCase();
  if (
    normalized.includes("outofstock") ||
    normalized.includes("out_of_stock") ||
    normalized.includes("out of stock") ||
    normalized.includes("soldout") ||
    normalized.includes("sold_out") ||
    normalized.includes("sold out") ||
    normalized.includes("discontinued") ||
    normalized === "oos"
  ) {
    return "OUT_OF_STOCK";
  }
  if (
    normalized.includes("instock") ||
    normalized.includes("in_stock") ||
    normalized.includes("in stock") ||
    normalized.includes("available") ||
    normalized.includes("preorder") ||
    normalized.includes("limitedavailability")
  ) {
    return "IN_STOCK";
  }
  return undefined;
}

function parsePriceNumber(raw?: string | number | null): number | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 ? raw : undefined;

  const match = String(raw).match(/\d+(?:[\s\u00A0',.]\d+)*/);
  if (!match) return undefined;

  let token = match[0].replace(/[\s\u00A0']/g, "");
  const hasComma = token.includes(",");
  const hasDot = token.includes(".");

  if (hasComma && hasDot) {
    if (token.lastIndexOf(",") > token.lastIndexOf(".")) {
      // European format: 2.500,00 -> 2500.00
      token = token.replace(/\./g, "").replace(",", ".");
    } else {
      // US/UK format: 1,200.00 -> 1200.00
      token = token.replace(/,/g, "");
    }
  } else if (hasComma) {
    const parts = token.split(",");
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      // Thousands separator: 1,200 or 1,000,000
      token = token.replace(/,/g, "");
    } else {
      // Decimal separator: 65,50 -> 65.50
      token = token.replace(",", ".");
    }
  } else if (hasDot) {
    const parts = token.split(".");
    if (parts.length > 2) {
      token = token.replace(/\./g, "");
    }
  }

  const val = parseFloat(token);
  return Number.isFinite(val) && val > 0 ? val : undefined;
}

/**
 * Tier 2 Ingestion: Fallback Extractor
 * Used when a store runs on a CUSTOM engine without a known JSON feed.
 * It parses OpenGraph meta tags and JSON-LD structured data.
 */
export async function extractMetadata(productUrl: string): Promise<ExtractedProduct> {
  const url = productUrl.startsWith('http') ? productUrl : `https://${productUrl}`;
  
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; DropAggBot/1.0)",
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch page: ${response.statusText}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  
  const product: ExtractedProduct = {
    title: "",
    description: "",
    mainImage: "",
    url: url
  };

  interface JsonLdOffer {
    price?: string | number;
    lowPrice?: string | number;
    highPrice?: string | number;
    priceSpecification?: { price?: string | number } | Array<{ price?: string | number }>;
    priceCurrency?: string;
    availability?: string;
  }

  interface JsonLdItem {
    "@type"?: string | string[];
    "@graph"?: JsonLdItem[];
    name?: string;
    description?: string;
    image?: string | { contentUrl?: string; url?: string } | Array<string | { contentUrl?: string; url?: string }>;
    offers?: JsonLdOffer | JsonLdOffer[];
  }

  // 1. Try to find JSON-LD Product Schema (Most accurate)
  const jsonLdScripts = $('script[type="application/ld+json"]');
  jsonLdScripts.each((_, el) => {
    try {
      const data = JSON.parse($(el).html() || "{}") as JsonLdItem | JsonLdItem[];
      // JSON-LD can be an object, an array, or contain a @graph array
      const rawList = Array.isArray(data) ? data : [data];
      const items: JsonLdItem[] = [];
      for (const entry of rawList) {
        if (entry && Array.isArray(entry["@graph"])) {
          items.push(...entry["@graph"]);
        } else if (entry) {
          items.push(entry);
        }
      }
      
      for (const item of items) {
        const typeVal = item?.['@type'];
        const isProduct =
          typeVal === 'Product' ||
          (Array.isArray(typeVal) && typeVal.includes('Product')) ||
          (typeof typeVal === 'string' && typeVal.includes('Product'));

        if (isProduct) {
          if (item.name) product.title = item.name;
          if (item.description) product.description = item.description;
          if (item.image) {
            const imgObj = Array.isArray(item.image) ? item.image[0] : item.image;
            product.mainImage = typeof imgObj === 'string' ? imgObj : (imgObj?.contentUrl || imgObj?.url || "");
          }
          if (item.offers) {
            const offer = Array.isArray(item.offers) ? item.offers[0] : item.offers;
            if (offer.price !== undefined || offer.lowPrice !== undefined) {
              product.price = parsePriceNumber(offer.price ?? offer.lowPrice);
            }
            if (offer.highPrice !== undefined) {
              const high = parsePriceNumber(offer.highPrice);
              if (high && product.price && high > product.price) {
                product.compareAtPrice = high;
              }
            }
            if (!product.compareAtPrice && offer.priceSpecification) {
              const specs = Array.isArray(offer.priceSpecification)
                ? offer.priceSpecification
                : [offer.priceSpecification];
              for (const spec of specs) {
                const specPrice = parsePriceNumber(spec?.price);
                if (specPrice && product.price && specPrice > product.price) {
                  product.compareAtPrice = specPrice;
                }
              }
            }
            if (offer.priceCurrency) product.currency = offer.priceCurrency;
            if (offer.availability) {
              const parsedAvail = parseAvailabilityStatus(String(offer.availability));
              if (parsedAvail) product.availability = parsedAvail;
            }
          }
          break; // Stop after finding the first valid product schema
        }
      }
    } catch {
      // Ignore JSON parse errors
    }
  });

  // 2. Fallback to OpenGraph tags if JSON-LD was incomplete
  if (!product.title) {
    product.title = $('meta[property="og:title"]').attr('content') || $('title').text() || "";
  }
  if (!product.description) {
    product.description = $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content') || "";
  }
  if (!product.mainImage) {
    product.mainImage = $('meta[property="og:image"]').attr('content') || "";
  }
  if (!product.price) {
    const ogPrice =
      $('meta[property="product:price:amount"]').attr('content') ||
      $('meta[property="og:price:amount"]').attr('content') ||
      $('meta[property="product:sale_price:amount"]').attr('content');
    if (ogPrice) product.price = parsePriceNumber(ogPrice);
  }
  if (!product.compareAtPrice) {
    const ogOriginal =
      $('meta[property="product:original_price:amount"]').attr('content') ||
      $('meta[property="og:price:standard_amount"]').attr('content');
    const ogSale = $('meta[property="product:sale_price:amount"]').attr('content');

    const origVal = ogOriginal ? parsePriceNumber(ogOriginal) : undefined;
    const saleVal = ogSale ? parsePriceNumber(ogSale) : undefined;

    if (saleVal && product.price && saleVal < product.price) {
      product.compareAtPrice = product.price;
      product.price = saleVal;
    } else if (origVal && product.price && origVal > product.price) {
      product.compareAtPrice = origVal;
    } else if (saleVal && origVal && origVal > saleVal) {
      product.price = saleVal;
      product.compareAtPrice = origVal;
    }
  }
  if (!product.compareAtPrice && product.price) {
    const domOldPriceText = $(
      ".price--compare, .was-price, .old-price, .js-store-prod-price-old, .t-store__card__price-old-value, del .amount, s.price-item--regular"
    )
      .first()
      .text();
    const domOldVal = parsePriceNumber(domOldPriceText);
    if (domOldVal && domOldVal > product.price) {
      product.compareAtPrice = domOldVal;
    }
  }
  if (!product.currency) {
    product.currency = $('meta[property="product:price:currency"]').attr('content') || $('meta[property="og:price:currency"]').attr('content');
  }
  if (!product.availability) {
    const ogAvail =
      $('meta[property="product:availability"]').attr('content') ||
      $('meta[property="og:availability"]').attr('content');
    const parsedAvail = parseAvailabilityStatus(ogAvail);
    if (parsedAvail) product.availability = parsedAvail;
  }

  if (product.compareAtPrice !== undefined && (!product.price || product.compareAtPrice <= product.price)) {
    delete product.compareAtPrice;
  }

  return product;
}
