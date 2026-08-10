import { NextResponse } from "next/server";
import { syncBrandChunkServerless } from "@/lib/serverless-ingestor";

export const maxDuration = 60;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    let page = 1;
    let autoChain = true;

    try {
      const body = await req.json();
      if (body.page) page = Number(body.page);
      if (body.autoChain !== undefined) autoChain = Boolean(body.autoChain);
    } catch (e) {
      const url = new URL(req.url);
      if (url.searchParams.get("page")) page = Number(url.searchParams.get("page"));
    }

    const result = await syncBrandChunkServerless(id, page, 250);

    // Self-Chaining: If hasMore is true and autoChain is enabled, fire the next page in background!
    if (result.hasMore && autoChain && result.nextPage) {
      const host = req.headers.get("host") || "localhost:3000";
      const protocol = req.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
      const nextChunkUrl = `${protocol}://${host}/api/brands/${id}/sync-chunk`;

      // Non-blocking fire-and-forget self-invocation
      fetch(nextChunkUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page: result.nextPage, autoChain: true }),
      }).catch((err) => {
        console.warn(`[Sync Chunk API] Background auto-chain error:`, err);
      });
    }

    return NextResponse.json({
      success: true,
      brandId: id,
      page: result.page,
      processedCount: result.processedCount,
      hasMore: result.hasMore,
      nextPage: result.nextPage,
      message: `Processed page ${result.page} (${result.processedCount} items)`,
    });
  } catch (error: any) {
    console.error("[Sync Chunk API Error]", error);
    return NextResponse.json({ error: error.message || "Chunk sync failed" }, { status: 500 });
  }
}
