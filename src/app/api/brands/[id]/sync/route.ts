import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncBrandChunkServerless } from "@/lib/serverless-ingestor";

export const maxDuration = 60;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const brand = await prisma.brand.findUnique({
      where: { id },
    });

    if (!brand) {
      return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    }

    if (process.env.REDIS_URL) {
      try {
        const { ingestionQueue } = await import("@/lib/queue");
        if (ingestionQueue) {
          await ingestionQueue.add(`sync-manual-${id}-${Date.now()}`, {
            brandId: id,
            feedUrl: `https://${brand.domain}`,
            platformType: brand.platformType,
          });
          return NextResponse.json({
            success: true,
            message: `Triggered Redis sync for ${brand.name}`,
          });
        }
      } catch (redisErr) {
        console.warn("[Sync API] Redis error, falling back to Serverless Chunked Ingestor:", redisErr);
      }
    }

    // Run Chunk 1 and auto-chain remaining pages in background
    const result = await syncBrandChunkServerless(id, 1, 250);

    if (result.hasMore && result.nextPage) {
      const host = req.headers.get("host") || "localhost:3000";
      const protocol = req.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
      const nextChunkUrl = `${protocol}://${host}/api/brands/${id}/sync-chunk`;

      fetch(nextChunkUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page: result.nextPage, autoChain: true }),
      }).catch((err) => {
        console.warn(`[Sync API] Auto-chain background call error:`, err);
      });
    }

    return NextResponse.json({
      success: true,
      brandId: id,
      page: result.page,
      processedCount: result.processedCount,
      hasMore: result.hasMore,
      message: result.hasMore
        ? `Synced page 1 (${result.processedCount} items). Background sync started for remaining pages.`
        : `Synced ${result.processedCount} items for ${brand.name}`,
    });
  } catch (error: any) {
    console.error("[Manual Sync API Error]", error);
    return NextResponse.json({ error: "Failed to trigger sync" }, { status: 500 });
  }
}
