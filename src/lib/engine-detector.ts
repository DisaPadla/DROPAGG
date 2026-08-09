/**
 * Engine Auto-Detector
 * Implements Tier 1 detection logic from the TDD to classify e-commerce backends.
 */

import { PlatformType } from "@prisma/client";

export interface DetectionResult {
  platform: PlatformType;
  confidence: number; // 0 to 1
  feedUrl?: string;
  reason?: string;
}

export async function detectEngine(domainUrl: string): Promise<DetectionResult> {
  // Ensure we have a valid absolute URL
  const url = domainUrl.startsWith('http') ? domainUrl : `https://${domainUrl}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    // Step 1: Initial GET Request (Homepage)
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const headers = response.headers;
    const text = await response.text();

    // Step 2: Header Analysis (Fastest & Most Reliable)
    
    // Shopify Check
    const serverHeader = headers.get('server')?.toLowerCase() || '';
    const xShopId = headers.get('x-shopid');
    const setCookie = headers.get('set-cookie') || '';
    
    if (serverHeader.includes('cloudflare') && (xShopId || setCookie.includes('_shopify_y'))) {
      return { platform: "SHOPIFY", confidence: 0.9, feedUrl: `${url}/products.json?limit=250`, reason: "Header Match (Shopify)" };
    }

    // WooCommerce Check
    const xPoweredBy = headers.get('x-powered-by')?.toLowerCase() || '';
    if (xPoweredBy.includes('woocommerce')) {
      return { platform: "WOOCOMMERCE", confidence: 0.9, feedUrl: `${url}/wp-json/wc/v3/products`, reason: "Header Match (WooCommerce)" };
    }

    // Step 3: DOM Signatures / Script Variables
    
    // Shopify DOM Check
    if (text.includes('window.Shopify') || text.includes('cdn.shopify.com')) {
      return { platform: "SHOPIFY", confidence: 0.8, feedUrl: `${url}/products.json?limit=250`, reason: "DOM Match (Shopify)" };
    }

    // WooCommerce DOM Check
    if (text.includes('<meta name="generator" content="WooCommerce') || text.includes('class="woocommerce')) {
      return { platform: "WOOCOMMERCE", confidence: 0.8, feedUrl: `${url}/wp-json/wc/v3/products`, reason: "DOM Match (WooCommerce)" };
    }

    // Tilda DOM Check
    if (text.includes('tilda-blocks') || text.includes('static.tildacdn.com')) {
      return { platform: "TILDA", confidence: 0.8, reason: "DOM Match (Tilda)" };
    }

    // OpenCart DOM Check
    if (text.includes('index.php?route=product/product') || text.includes('catalog/view/theme/')) {
      return { platform: "OPENCART", confidence: 0.7, reason: "DOM Match (OpenCart)" };
    }

    // Step 4: Feed Probing (Verification)
    // If we're here, we couldn't detect from the homepage. 
    // We can probe specific API endpoints as a last resort.
    try {
      const shopifyProbe = await fetch(`${url}/products.json?limit=1`, { method: 'HEAD' });
      if (shopifyProbe.ok && shopifyProbe.headers.get('content-type')?.includes('application/json')) {
        return { platform: "SHOPIFY", confidence: 0.95, feedUrl: `${url}/products.json?limit=250`, reason: "Probe Match (Shopify)" };
      }
    } catch (e) {
      // Ignore probe failure
    }

    // Step 5: Fallback (CUSTOM)
    return { platform: "CUSTOM", confidence: 1.0, reason: "No known signatures detected" };

  } catch (error: any) {
    console.error(`[Detector] Error scanning ${domainUrl}:`, error.message);
    return { platform: "CUSTOM", confidence: 0, reason: `Scan failed: ${error.message}` };
  }
}
