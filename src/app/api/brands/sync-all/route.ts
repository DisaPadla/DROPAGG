import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncBrandServerless } from "@/lib/serverless-ingestor";

export const maxDuration = 60; // Max Vercel Serverless Function duration

export async function POST() {
  try {
    const brands = await prisma.brand.findMany();

    if (brands.length === 0) {
      return NextResponse.json({ success: true, message: "No brands to sync" });
    }

    if (process.env.REDIS_URL) {
      try {
        const { ingestionQueue } = await import("@/lib/queue");
        if (ingestionQueue) {
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
        }
      } catch (redisErr) {
        console.warn("[Sync All API] Redis fallback to serverless:", redisErr);
      }
    }

    // Run parallel serverless sync for all stores
    const syncPromises = brands.map(async (b: any) => {
      try {
        return await syncBrandServerless(b.id);
      } catch (e) {
        console.error(`[Sync All] Failed syncing ${b.name}:`, e);
        return 0;
      }
    });

    // 45-second timeout safety race to guarantee response before Vercel's 60s limit
    const timeoutPromise = new Promise<{ isTimeout: true }>((resolve) =>
      setTimeout(() => resolve({ isTimeout: true }), 45000)
    );

    const outcome = await Promise.race([
      Promise.allSettled(syncPromises),
      timeoutPromise,
    ]);

    if ("isTimeout" in outcome) {
      return NextResponse.json({
        success: true,
        message: `Sync initialized in background for ${brands.length} stores.`,
      });
    }

    let totalItems = 0;
    outcome.forEach((res) => {
      if (res.status === "fulfilled") {
        totalItems += res.value || 0;
      }
    });

    return NextResponse.json({
      success: true,
      message: `Synced ${totalItems} items across ${brands.length} stores`,
    });
  } catch (error: any) {
    console.error("[Sync All API Error]", error);
    return NextResponse.json({ error: "Failed to trigger sync" }, { status: 500 });
  }
}
