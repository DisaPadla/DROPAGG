import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncBrandServerless } from "@/lib/serverless-ingestor";

export const maxDuration = 60; // Vercel Serverless max duration

export async function POST() {
  try {
    const brands = await prisma.brand.findMany();

    if (brands.length === 0) {
      return NextResponse.json({ success: true, message: "No brands to sync" });
    }

    if (process.env.REDIS_URL) {
      try {
        const { ingestionQueue } = await import("@/lib/queue");
        for (const b of brands) {
          await ingestionQueue.add(`sync-all-${b.id}-${Date.now()}`, {
            brandId: b.id,
            feedUrl: `https://${b.domain}`,
            platformType: b.platformType,
          });
        }
        return NextResponse.json({
          success: true,
          message: `Queued sync for ${brands.length} brands`,
        });
      } catch (redisErr) {
        console.warn("[Sync All API] Redis fallback to serverless:", redisErr);
      }
    }

    // Serverless execution for Vercel Hobby Plan
    let totalItems = 0;
    for (const b of brands) {
      try {
        const count = await syncBrandServerless(b.id);
        totalItems += count;
      } catch (e) {
        console.error(`[Sync All] Failed syncing ${b.name}:`, e);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Synced ${totalItems} items across ${brands.length} brands`,
    });
  } catch (error: any) {
    console.error("[Sync All API Error]", error);
    return NextResponse.json({ error: "Failed to trigger sync" }, { status: 500 });
  }
}
