import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { detectEngine } from "@/lib/engine-detector";
import { syncBrandChunkServerless } from "@/lib/serverless-ingestor";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { url } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: "Invalid URL provided" }, { status: 400 });
    }

    // 1. Extract and trim root origin & hostname (e.g. "https://sndct.com/sadasd/asdadsdas" -> "https://sndct.com" / "sndct.com")
    let parsedUrl;
    try {
      const cleanInput = url.trim().startsWith("http") ? url.trim() : `https://${url.trim()}`;
      parsedUrl = new URL(cleanInput);
    } catch (e) {
      return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
    }

    const rootOrigin = parsedUrl.origin; // https://sndct.com
    const domain = parsedUrl.hostname.replace(/^www\./, ''); // sndct.com
    const name = domain.split('.')[0].toUpperCase(); // SNDCT

    // 2. Check if brand already exists in database
    let brand = await prisma.brand.findUnique({ where: { domain } });

    if (brand) {
      // If brand exists, attempt sync chunk and return 200 with brand data to allow immediate view
      try {
        await syncBrandChunkServerless(brand.id, 1, 250);
      } catch (e) {
        console.warn("[Suggest API] Re-sync existing brand error:", e);
      }
      return NextResponse.json({ 
        success: true, 
        brand,
        message: `Store ${name} is already in your workspace!` 
      });
    }

    // Detect the e-commerce engine using root origin
    let detection: { platform: any; feedUrl?: string } = { platform: "SHOPIFY", feedUrl: rootOrigin };
    try {
      detection = await detectEngine(rootOrigin);
    } catch (detErr) {
      console.warn("[Suggest API] Engine detection fallback to SHOPIFY:", detErr);
    }

    const feedUrl = detection.feedUrl || rootOrigin;

    brand = await prisma.brand.create({
      data: {
        name,
        domain,
        platformType: detection.platform,
        baseCountry: "US",
        defaultCurrency: "USD"
      }
    });

    // Attempt initial chunk ingestion synchronously so products are saved before response returns
    try {
      const chunkResult = await syncBrandChunkServerless(brand.id, 1, 250);

      // Auto-chain next pages in background if more items exist
      if (chunkResult.hasMore && chunkResult.nextPage) {
        const host = req.headers.get("host") || "localhost:3000";
        const protocol = req.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
        const nextChunkUrl = `${protocol}://${host}/api/brands/${brand.id}/sync-chunk`;

        fetch(nextChunkUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ page: chunkResult.nextPage, autoChain: true }),
        }).catch((err) => {
          console.warn(`[Suggest API] Auto-chain background call error:`, err);
        });
      }
    } catch (syncErr) {
      console.warn("[Suggest API] Initial chunk ingestion error (brand created anyway):", syncErr);
    }

    return NextResponse.json({ 
      success: true, 
      brand,
      message: `Successfully added ${name} and imported products to your workspace!` 
    });

  } catch (error: any) {
    console.error("[Suggest API Error]", error);
    return NextResponse.json({ error: error.message || "Failed to add brand" }, { status: 500 });
  }
}
