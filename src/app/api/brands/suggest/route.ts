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

    // 1. Extract hostname to use as domain and basic name
    let parsedUrl;
    try {
      parsedUrl = new URL(url.startsWith('http') ? url : `https://${url}`);
    } catch (e) {
      return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
    }
    
    const domain = parsedUrl.hostname.replace(/^www\./, '');
    const name = domain.split('.')[0].toUpperCase();

    // 2. Check if brand already exists in database
    let brand = await prisma.brand.findUnique({ where: { domain } });

    if (brand) {
      return NextResponse.json({ error: "Brand already added to your workspace!" }, { status: 409 });
    }

    // Detect the e-commerce engine
    const detection = await detectEngine(parsedUrl.origin);
    const feedUrl = detection.feedUrl || parsedUrl.origin;

    brand = await prisma.brand.create({
      data: {
        name,
        domain,
        platformType: detection.platform,
        baseCountry: "US",
        defaultCurrency: "USD"
      }
    });

    // Enqueue for ingestion: if REDIS_URL is configured use BullMQ, otherwise run Serverless Ingestor directly
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
      // Run direct serverless sync for Vercel Hobby Plan
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
