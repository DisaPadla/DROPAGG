import * as cheerio from "cheerio";

export interface ExtractedProduct {
  title: string;
  description: string;
  mainImage: string;
  price?: number;
  currency?: string;
  url: string;
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
  
  let product: ExtractedProduct = {
    title: "",
    description: "",
    mainImage: "",
    url: url
  };

  // 1. Try to find JSON-LD Product Schema (Most accurate)
  const jsonLdScripts = $('script[type="application/ld+json"]');
  jsonLdScripts.each((_, el) => {
    try {
      const data = JSON.parse($(el).html() || "{}");
      // JSON-LD can be an array or object
      const items = Array.isArray(data) ? data : [data];
      
      for (const item of items) {
        if (item['@type'] === 'Product' || item['@type']?.includes('Product')) {
          if (item.name) product.title = item.name;
          if (item.description) product.description = item.description;
          if (item.image) {
            const imgObj = Array.isArray(item.image) ? item.image[0] : item.image;
            product.mainImage = typeof imgObj === 'string' ? imgObj : (imgObj.contentUrl || imgObj.url || "");
          }
          if (item.offers) {
            const offer = Array.isArray(item.offers) ? item.offers[0] : item.offers;
            if (offer.price) product.price = parseFloat(offer.price);
            if (offer.priceCurrency) product.currency = offer.priceCurrency;
          }
          break; // Stop after finding the first valid product schema
        }
      }
    } catch (e) {
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
    const ogPrice = $('meta[property="product:price:amount"]').attr('content');
    if (ogPrice) product.price = parseFloat(ogPrice);
  }
  if (!product.currency) {
    product.currency = $('meta[property="product:price:currency"]').attr('content');
  }

  return product;
}
