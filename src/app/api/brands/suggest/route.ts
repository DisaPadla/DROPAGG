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
      // Trigger background chunk sync and return immediately
      syncBrandChunkServerless(brand.id, 1, 250).catch((err) => {
        console.warn("[Suggest API] Background re-sync error:", err);
      });

      return NextResponse.json({ 
        success: true, 
        brand,
        message: `Store ${name} is already in your workspace!` 
      });
    }

    // 3. Fast Engine Detection with fallback to SHOPIFY
    let platformType: any = "SHOPIFY";
    try {
      const detection = await detectEngine(rootOrigin);
      if (detection?.platform) {
        platformType = detection.platform;
      }
    } catch (detErr) {
      console.warn("[Suggest API] Engine detection fallback to SHOPIFY:", detErr);
    }

    // 4. Create Brand in DB immediately
    brand = await prisma.brand.create({
      data: {
        name,
        domain,
        platformType,
        baseCountry: "US",
        defaultCurrency: "USD"
      }
    });

    // 5. Fire non-blocking background chunk ingestion (0.5s fast response!)
    const host = req.headers.get("host") || "localhost:3000";
    const protocol = req.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
    const syncChunkUrl = `${protocol}://${host}/api/brands/${brand.id}/sync-chunk`;

    fetch(syncChunkUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: 1, autoChain: true }),
    }).catch((err) => {
      console.warn("[Suggest API] Background chunk sync trigger error:", err);
    });

    // Return instant HTTP 200 response with brand data so UI switches to catalog page in <1 sec
    return NextResponse.json({ 
      success: true, 
      brand,
      message: `Successfully added ${name}! Importing drops...` 
    });

  } catch (error: any) {
    console.error("[Suggest API Error]", error);
    return NextResponse.json({ error: error.message || "Failed to add brand" }, { status: 500 });
  }
}
