import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncBrandServerless } from "@/lib/serverless-ingestor";

export const maxDuration = 60; // Allow up to 60 seconds execution on Vercel Serverless

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

    // If REDIS_URL is present, attempt BullMQ queue, otherwise run Serverless Ingestor directly
    if (process.env.REDIS_URL) {
      try {
        const { ingestionQueue } = await import("@/lib/queue");
        await ingestionQueue.add(`sync-manual-${id}-${Date.now()}`, {
          brandId: id,
          feedUrl: `https://${brand.domain}`,
          platformType: brand.platformType,
        });
        return NextResponse.json({
          success: true,
          message: `Triggered Redis sync for ${brand.name}`,
        });
      } catch (redisErr) {
        console.warn("[Sync API] Redis error, falling back to Serverless Ingestor:", redisErr);
      }
    }

    // Run direct serverless sync for Vercel Hobby Plan
    const count = await syncBrandServerless(id);

    return NextResponse.json({
      success: true,
      message: `Synced ${count} items for ${brand.name}`,
    });
  } catch (error: any) {
    console.error("[Manual Sync API Error]", error);
    return NextResponse.json({ error: "Failed to trigger sync" }, { status: 500 });
  }
}
