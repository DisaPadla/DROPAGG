import { NextResponse } from "next/server";
import { PlatformType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { detectEngine, detectStoreLocale, extractLocaleFromDomain } from "@/lib/engine-detector";
import { syncBrandChunkServerless } from "@/lib/serverless-ingestor";
import { ensureTablesExist } from "@/lib/db-init";
import { getCurrentUser } from "@/lib/session";

export const maxDuration = 60;

async function linkBrandToCurrentUser(brandId: string) {
  try {
    const currentUser = await getCurrentUser();
    await prisma.userBrand.upsert({
      where: {
        userId_brandId: {
          userId: currentUser.id,
          brandId,
        },
      },
      update: {},
      create: {
        userId: currentUser.id,
        brandId,
      },
    });
  } catch (err) {
    console.warn("[Suggest API] Could not link brand to UserBrand:", err);
  }
}

function formatErrorMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  const lowerMsg = msg.toLowerCase();
  if (!process.env.DATABASE_URL) {
    return "Database connection string is missing. Please set DATABASE_URL in Vercel settings or .env file.";
  }
  if (
    msg.includes("ECONNREFUSED") ||
    msg.includes("ETIMEDOUT") ||
    msg.includes("ENOTFOUND") ||
    msg.includes("XX000") ||
    lowerMsg.includes("can't reach database server") ||
    lowerMsg.includes("tenant or user not found") ||
    (lowerMsg.includes("tenant/user") && lowerMsg.includes("not found"))
  ) {
    if (
      process.env.DATABASE_URL.includes("supabase.co") ||
      process.env.DATABASE_URL.includes("supabase.com") ||
      lowerMsg.includes("tenant/user")
    ) {
      return "Cannot connect to Supabase database (tenant/user not found). Your Supabase project is PAUSED or deleted. Open supabase.com/dashboard and click 'Restore project', or update DATABASE_URL in Vercel.";
    }
    if (msg.includes("51214")) {
      return "Local PostgreSQL database on port 51214 is not running. Please start your database or update DATABASE_URL in .env.";
    }
    return "PostgreSQL database server is unreachable. Please verify your DATABASE_URL and database status.";
  }
  return msg;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { url } = body;

    if (!url || typeof url !== "string" || !url.trim()) {
      return NextResponse.json({ error: "Invalid URL provided" }, { status: 400 });
    }

    // 1. Extract and trim root origin & hostname (e.g. "https://sndct.com/sadasd/asdadsdas" -> "https://sndct.com" / "sndct.com")
    let parsedUrl: URL;
    try {
      const cleanInput = url.trim().startsWith("http") ? url.trim() : `https://${url.trim()}`;
      parsedUrl = new URL(cleanInput);
    } catch {
      return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
    }

    const rootOrigin = parsedUrl.origin; // https://sndct.com
    const domain = parsedUrl.hostname.replace(/^www\./, ""); // sndct.com
    if (!domain || domain.length < 3 || !domain.includes(".")) {
      return NextResponse.json({ error: "Please enter a valid store website URL (e.g. https://store.com)" }, { status: 400 });
    }

    const name = domain.split(".")[0].toUpperCase(); // SNDCT

    // 2. Check if brand already exists in database (with auto table creation fallback)
    let brand;
    try {
      brand = await prisma.brand.findUnique({ where: { domain } });
    } catch (dbErr: unknown) {
      console.warn(
        "[Suggest API] Brand query failed, attempting ensureTablesExist...",
        dbErr instanceof Error ? dbErr.message : dbErr
      );
      try {
        await ensureTablesExist();
        brand = await prisma.brand.findUnique({ where: { domain } });
      } catch (retryErr: unknown) {
        console.error("[Suggest API] DB error after auto-init attempt:", retryErr);
        return NextResponse.json({ error: formatErrorMessage(retryErr) }, { status: 500 });
      }
    }

    if (brand) {
      // If existing brand had default USD/US, verify real store currency & country before re-sync
      if (brand.defaultCurrency === "USD" && brand.baseCountry === "US") {
        try {
          const locale = await detectStoreLocale(rootOrigin);
          if (
            (locale.currency && locale.currency !== "USD") ||
            (locale.country && locale.country !== "US")
          ) {
            brand = await prisma.brand.update({
              where: { id: brand.id },
              data: {
                defaultCurrency: locale.currency || brand.defaultCurrency,
                baseCountry: locale.country || brand.baseCountry,
              },
            });
            if (locale.currency && locale.currency !== "USD") {
              await prisma.productVariant.updateMany({
                where: { product: { brandId: brand.id }, currency: "USD" },
                data: { currency: locale.currency },
              });
            }
          }
        } catch (locErr) {
          console.warn("[Suggest API] Locale refresh warning:", locErr);
        }
      }

      await linkBrandToCurrentUser(brand.id);

      // Trigger background chunk sync and return immediately
      syncBrandChunkServerless(brand.id, 1, 250).catch((err) => {
        console.warn("[Suggest API] Background re-sync error:", err);
      });

      return NextResponse.json({
        success: true,
        brand,
        message: `Store ${name} added to your Personal Radar!`,
      });
    }

    // 3. Fast Engine & Store Currency/Country Detection with fallback
    const domainFallback = extractLocaleFromDomain(rootOrigin);
    let platformType: PlatformType = "SHOPIFY";
    let baseCountry: string = domainFallback.country || "US";
    let defaultCurrency: string = domainFallback.currency || "USD";

    try {
      const detection = await detectEngine(rootOrigin);
      if (detection?.platform) {
        platformType = detection.platform;
      }
      if (detection?.country) {
        baseCountry = detection.country;
      }
      if (detection?.currency) {
        defaultCurrency = detection.currency;
      }
    } catch (detErr) {
      console.warn("[Suggest API] Engine detection fallback to SHOPIFY:", detErr);
    }

    // 4. Create Brand in DB immediately with detected country & currency
    try {
      brand = await prisma.brand.create({
        data: {
          name,
          domain,
          platformType,
          baseCountry,
          defaultCurrency,
        },
      });
      await linkBrandToCurrentUser(brand.id);
    } catch (createErr: unknown) {
      console.error("[Suggest API] Brand creation error:", createErr);
      return NextResponse.json({ error: formatErrorMessage(createErr) }, { status: 500 });
    }

    // 5. Fire non-blocking background chunk ingestion (fast response!)
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
      message: `Successfully added ${name}! Importing drops...`,
    });
  } catch (error: unknown) {
    console.error("[Suggest API Error]", error);
    return NextResponse.json({ error: formatErrorMessage(error) }, { status: 500 });
  }
}
