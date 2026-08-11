import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { detectEngine } from "@/lib/engine-detector";
import { syncBrandServerless } from "@/lib/serverless-ingestor";

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
      // If brand exists, sync it and return 200 with brand data to allow immediate view
      try {
        await syncBrandServerless(brand.id);
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
    const detection = await detectEngine(rootOrigin);
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

    // Run direct serverless sync for Vercel Hobby Plan (or Redis if present)
    if (process.env.REDIS_URL) {
      try {
        const { ingestionQueue } = await import("@/lib/queue");
        if (ingestionQueue) {
          await ingestionQueue.add(`ingest-${brand.id}-${Date.now()}`, {
            brandId: brand.id,
            feedUrl: feedUrl,
            platformType: brand.platformType
          });
        }
      } catch (err) {
        console.warn("[Suggest API] Redis queue unavailable, running Serverless ingestion:", err);
        await syncBrandServerless(brand.id);
      }
    } else {
      await syncBrandServerless(brand.id);
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
