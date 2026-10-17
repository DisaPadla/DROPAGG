import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { ensureTablesExist } from "@/lib/db-init";
import { appendUtmParams } from "@/lib/utm";

interface OutboundClickRecord {
  id: string;
  productId: string | null;
  brandId: string | null;
  userId: string | null;
  targetUrl: string;
  source: string;
  clickedAt: Date;
}

interface OutboundClickDelegate {
  create: (args: { data: OutboundClickRecord }) => Promise<OutboundClickRecord>;
  count: () => Promise<number>;
  findMany: (args: {
    orderBy: { clickedAt: "desc" };
    take: number;
  }) => Promise<OutboundClickRecord[]>;
}

function getOutboundClickDelegate(): OutboundClickDelegate | undefined {
  return (prisma as unknown as { outboundClick?: OutboundClickDelegate }).outboundClick;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.targetUrl !== "string" || !body.targetUrl.trim()) {
      return NextResponse.json({ error: "Valid targetUrl is required" }, { status: 400 });
    }

    const targetUrl = appendUtmParams(body.targetUrl.trim());
    if (!targetUrl || targetUrl === "#") {
      return NextResponse.json({ error: "Valid targetUrl is required" }, { status: 400 });
    }

    const productId = typeof body.productId === "string" && body.productId.trim() ? body.productId.trim() : null;
    const brandId = typeof body.brandId === "string" && body.brandId.trim() ? body.brandId.trim() : null;
    const source = typeof body.source === "string" && body.source.trim() ? body.source.trim() : "catalog";

    let userId: string | null =
      typeof body.userId === "string" && body.userId.trim() ? body.userId.trim() : null;
    if (!userId) {
      try {
        const cookieStore = await cookies();
        userId = cookieStore.get("user_id")?.value || null;
      } catch {
        // Ignore cookie read errors outside request context
      }
    }

    const clickId = randomUUID();
    const clickedAt = new Date();

    console.info("[OutboundClick]", {
      id: clickId,
      productId,
      brandId,
      userId,
      source,
      targetUrl,
      clickedAt: clickedAt.toISOString(),
    });

    const delegate = getOutboundClickDelegate();
    const persistClick = async () => {
      if (delegate) {
        return await delegate.create({
          data: {
            id: clickId,
            productId,
            brandId,
            userId,
            targetUrl,
            source,
            clickedAt,
          },
        });
      }

      await prisma.$executeRawUnsafe(
        `INSERT INTO "OutboundClick" ("id", "productId", "brandId", "userId", "targetUrl", "source", "clickedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        clickId,
        productId,
        brandId,
        userId,
        targetUrl,
        source,
        clickedAt
      );
      return { id: clickId, productId, brandId, userId, targetUrl, source, clickedAt };
    };

    try {
      const record = await persistClick();
      return NextResponse.json({
        success: true,
        persisted: true,
        click: record,
      });
    } catch (dbErr: unknown) {
      // Attempt auto-init if table is missing or foreign key fails
      try {
        await ensureTablesExist();
        await prisma.$executeRawUnsafe(
          `INSERT INTO "OutboundClick" ("id", "productId", "brandId", "userId", "targetUrl", "source", "clickedAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          clickId,
          null,
          null,
          userId,
          targetUrl,
          source,
          clickedAt
        );
        return NextResponse.json({
          success: true,
          persisted: true,
          click: { id: clickId, productId, brandId, userId, targetUrl, source, clickedAt },
        });
      } catch (retryErr: unknown) {
        const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
        const dbMsg = dbErr instanceof Error ? dbErr.message : String(dbErr);
        console.warn("[OutboundClick] DB persistence skipped (logged to stdout):", retryMsg || dbMsg);
        return NextResponse.json({
          success: true,
          persisted: false,
          click: { id: clickId, productId, brandId, userId, targetUrl, source, clickedAt },
        });
      }
    }
  } catch (error: unknown) {
    console.error("[OutboundClick API Error]", error);
    return NextResponse.json({ error: "Failed to log outbound click" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const delegate = getOutboundClickDelegate();
    if (delegate) {
      const [totalClicks, clicks] = await Promise.all([
        delegate.count(),
        delegate.findMany({
          orderBy: { clickedAt: "desc" },
          take: 50,
        }),
      ]);
      return NextResponse.json({ totalClicks, clicks });
    }

    const [countRows, rows] = await Promise.all([
      prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS "count" FROM "OutboundClick"`) as Promise<
        Array<{ count: number | string }>
      >,
      prisma.$queryRawUnsafe(
        `SELECT "id", "productId", "brandId", "userId", "targetUrl", "source", "clickedAt"
         FROM "OutboundClick"
         ORDER BY "clickedAt" DESC
         LIMIT 50`
      ) as Promise<OutboundClickRecord[]>,
    ]);

    return NextResponse.json({
      totalClicks: Number(countRows?.[0]?.count ?? rows.length),
      clicks: rows,
    });
  } catch (err: unknown) {
    console.warn("[OutboundClick GET] Returning empty stats:", err instanceof Error ? err.message : err);
    return NextResponse.json({ totalClicks: 0, clicks: [] });
  }
}
