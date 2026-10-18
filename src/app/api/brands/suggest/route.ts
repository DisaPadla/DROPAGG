import { NextResponse } from "next/server";
import { detectEngine, extractLocaleFromDomain } from "@/lib/engine-detector";
import {
  scrapeBrandChunkStateless,
  StatelessBrandMeta,
} from "@/lib/serverless-ingestor";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { url, page = 1, limit = 250, brandMeta } = body;

    if (!url || typeof url !== "string" || !url.trim()) {
      return NextResponse.json({ error: "Invalid URL provided" }, { status: 400 });
    }

    let parsedUrl: URL;
    try {
      const cleanInput = url.trim().startsWith("http")
        ? url.trim()
        : `https://${url.trim()}`;
      parsedUrl = new URL(cleanInput);
    } catch {
      return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
    }

    const rootOrigin = parsedUrl.origin;
    const domain = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
    if (!domain || domain.length < 3 || !domain.includes(".")) {
      return NextResponse.json(
        { error: "Please enter a valid store website URL (e.g. https://store.com)" },
        { status: 400 }
      );
    }

    const name = brandMeta?.name || domain.split(".")[0].toUpperCase();
    const domainFallback = extractLocaleFromDomain(rootOrigin);

    let platformType: string = brandMeta?.platformType || "SHOPIFY";
    let baseCountry: string = brandMeta?.baseCountry || domainFallback.country || "US";
    let defaultCurrency: string =
      brandMeta?.defaultCurrency || domainFallback.currency || "USD";

    // Only run engine detection on page 1 if platformType wasn't already supplied
    if (page === 1 && !brandMeta?.platformType) {
      try {
        const detection = await detectEngine(rootOrigin);
        if (detection?.platform) {
          platformType = detection.platform;
        }
        if (detection?.country) {
          baseCountry = detection.country;
        }
        if (detection?.currency) {
          defaultCurrency = detection.currency;
        }
      } catch (detErr) {
        console.warn("[Suggest Stateless API] Engine detection fallback to SHOPIFY:", detErr);
      }
    }

    const nowIso = new Date().toISOString();
    const initialBrandMeta: StatelessBrandMeta = {
      id: brandMeta?.id || `brand_${domain}`,
      name,
      domain,
      platformType,
      syncStatus: "ACTIVE",
      baseCountry,
      defaultCurrency,
      createdAt: brandMeta?.createdAt || nowIso,
      updatedAt: nowIso,
    };

    const scrapeResult = await scrapeBrandChunkStateless(
      initialBrandMeta,
      Number(page) || 1,
      Number(limit) || 250
    );

    return NextResponse.json({
      success: true,
      brand: scrapeResult.brand,
      products: scrapeResult.products,
      page: scrapeResult.page,
      processedCount: scrapeResult.processedCount,
      hasMore: scrapeResult.hasMore,
      nextPage: scrapeResult.nextPage,
      message: `Successfully synced ${scrapeResult.brand.name} (${scrapeResult.processedCount} items) to your device!`,
    });
  } catch (error: unknown) {
    console.error("[Suggest Stateless API Error]", error);
    const msg = error instanceof Error ? error.message : "Failed to scan store";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
