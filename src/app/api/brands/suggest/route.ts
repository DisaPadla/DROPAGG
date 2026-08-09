import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { detectEngine } from "@/lib/engine-detector";
import { ingestionQueue } from "@/lib/queue";

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

    // 2. Check if brand already exists in local database
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

    // Enqueue for immediate ingestion
    await ingestionQueue.add(`ingest-${brand.id}-${Date.now()}`, {
      brandId: brand.id,
      feedUrl: feedUrl,
      platformType: brand.platformType
    });

    return NextResponse.json({ 
      success: true, 
      message: `Successfully added ${name} to your local workspace!` 
    });

  } catch (error: any) {
    console.error("[Suggest API Error]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
