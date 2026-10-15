import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { detectEngine } from "@/lib/engine-detector";
import { syncBrandChunkServerless } from "@/lib/serverless-ingestor";
import { ensureTablesExist } from "@/lib/db-init";

export const maxDuration = 60;

function formatErrorMessage(error: any): string {
  const msg = error?.message || String(error);
  if (!process.env.DATABASE_URL) {
    return "Database connection string is missing. Please set DATABASE_URL in Vercel settings or .env file.";
  }
  if (
    msg.includes("ECONNREFUSED") ||
    msg.includes("ETIMEDOUT") ||
    msg.includes("Can't reach database server") ||
    msg.includes("Tenant or user not found")
  ) {
    if (
      process.env.DATABASE_URL.includes("supabase.co") ||
      process.env.DATABASE_URL.includes("supabase.com")
    ) {
      return "Cannot connect to Supabase database. Your Supabase project is likely PAUSED due to inactivity. Open supabase.com and click 'Restore project'.";
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
    } catch (e) {
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
    } catch (dbErr: any) {
      console.warn("[Suggest API] Brand query failed, attempting ensureTablesExist...", dbErr?.message);
      try {
        await ensureTablesExist();
        brand = await prisma.brand.findUnique({ where: { domain } });
      } catch (retryErr: any) {
        console.error("[Suggest API] DB error after auto-init attempt:", retryErr);
        return NextResponse.json({ error: formatErrorMessage(retryErr) }, { status: 500 });
      }
    }

    if (brand) {
      // Trigger background chunk sync and return immediately
      syncBrandChunkServerless(brand.id, 1, 250).catch((err) => {
        console.warn("[Suggest API] Background re-sync error:", err);
      });

      return NextResponse.json({
        success: true,
        brand,
        message: `Store ${name} is already in your workspace!`,
      });
    }

    // 3. Fast Engine Detection with fallback to SHOPIFY
    let platformType: any = "SHOPIFY";
    try {
      const detection = await detectEngine(rootOrigin);
      if (detection?.platform) {
        platformType = detection.platform;
      }
    } catch (detErr) {
      console.warn("[Suggest API] Engine detection fallback to SHOPIFY:", detErr);
    }

    // 4. Create Brand in DB immediately
    try {
      brand = await prisma.brand.create({
        data: {
          name,
          domain,
          platformType,
          baseCountry: "US",
          defaultCurrency: "USD",
        },
      });
    } catch (createErr: any) {
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
  } catch (error: any) {
    console.error("[Suggest API Error]", error);
    return NextResponse.json({ error: formatErrorMessage(error) }, { status: 500 });
  }
}
