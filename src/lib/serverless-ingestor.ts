import * as cheerio from "cheerio";
import { AvailabilityStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { extractMetadata } from "./tier2-extractor";
import { inferCategory } from "./category-classifier";

export interface ChunkSyncResult {
  page: number;
  processedCount: number;
  hasMore: boolean;
  nextPage?: number;
}

export async function syncBrandChunkServerless(
  brandId: string,
  page: number = 1,
  limit: number = 250
): Promise<ChunkSyncResult> {
  const brand = await prisma.brand.findUnique({ where: { id: brandId } });
  if (!brand) throw new Error("Brand not found");

  const rates = await prisma.exchangeRate.findMany();
  const rateMap = new Map(rates.map((r: { targetCurrency: string; rate: any }) => [r.targetCurrency, Number(r.rate)]));

  const getNormalizedPrice = (price: number, currency: string): number => {
    if (currency === "USD") return price;
    const rate = rateMap.get(currency);
    return rate ? price / Number(rate) : price;
  };

  let processedCount = 0;
  let hasMore = false;

  // Set brand status to SYNCING
  await prisma.brand.update({
    where: { id: brand.id },
    data: { syncStatus: "SYNCING" },
  });

  // Non-Shopify Brands (Tier 2 Web Scraper)
  if (brand.platformType !== "SHOPIFY") {
    const targetUrl = `https://${brand.domain}`;
    const res = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    });
    const html = await res.text();
    const $ = cheerio.load(html);

    const productUrls = new Set<string>();
    $("a").each((_, el) => {
      const href = $(el).attr("href");
      if (
        href &&
        (href.includes("/product") ||
          href.includes("/tproduct") ||
          href.includes("/item") ||
          href.includes("/shop/") ||
          href.includes("/catalog/"))
      ) {
        const fullUrl = href.startsWith("http")
          ? href
          : `https://${brand.domain}${href.startsWith("/") ? "" : "/"}${href}`;
        productUrls.add(fullUrl);
      }
    });

    for (const prodUrl of Array.from(productUrls)) {
      try {
        const meta = await extractMetadata(prodUrl);
        if (!meta.title || !meta.price) continue;

        const category = inferCategory(meta.title, "", [], meta.description);

        const product = await prisma.product.upsert({
          where: { canonicalUrl: meta.url },
          update: {
            title: meta.title,
            description: meta.description,
            category,
            mainImage: meta.mainImage,
          },
          create: {
            brandId: brand.id,
            canonicalUrl: meta.url,
            externalId: meta.url,
            title: meta.title,
            description: meta.description,
            category,
            mainImage: meta.mainImage,
          },
        });

        const rawPrice = meta.price;
        const currency = meta.currency || brand.defaultCurrency;
        const normalizedPrice = getNormalizedPrice(rawPrice, currency);

        await prisma.productVariant.upsert({
          where: {
            productId_size_color: {
              productId: product.id,
              size: "OS",
              color: "DEFAULT",
            },
          },
          update: {
            availability: "IN_STOCK",
            rawPrice,
            currency,
            normalizedPrice,
          },
          create: {
            productId: product.id,
            externalId: meta.url,
            size: "OS",
            color: "DEFAULT",
            availability: "IN_STOCK",
            rawPrice,
            currency,
            normalizedPrice,
          },
        });
        processedCount++;
      } catch (e) {
        console.error(`[Serverless Ingestor] Error scraping ${prodUrl}:`, e);
      }
    }
    hasMore = false;
  } else {
    // Shopify Brands - Paginated Fetching (limit per page = 250)
    const feedUrl = `https://${brand.domain}/products.json?limit=${limit}&page=${page}`;
    const response = await fetch(feedUrl);
    if (!response.ok) throw new Error(`Failed fetching Shopify feed: ${response.statusText}`);

    const data = await response.json();
    const products = data.products || [];

    hasMore = products.length === limit;

    for (const sp of products) {
      try {
        const canonicalUrl = `https://${brand.domain}/products/${sp.handle}`;
        const category = inferCategory(sp.title, sp.product_type, sp.tags, sp.body_html);

        const product = await prisma.product.upsert({
          where: { canonicalUrl },
          update: {
            title: sp.title,
            description: sp.body_html,
            category,
            mainImage: sp.images?.[0]?.src || "",
          },
          create: {
            brandId: brand.id,
            canonicalUrl,
            externalId: sp.id.toString(),
            title: sp.title,
            description: sp.body_html,
            category,
            mainImage: sp.images?.[0]?.src || "",
          },
        });

        let sizeKey: "option1" | "option2" | "option3" | null = null;
        let colorKey: "option1" | "option2" | "option3" | null = null;

        if (Array.isArray(sp.options)) {
          for (let i = 0; i < sp.options.length; i++) {
            const name = (sp.options[i]?.name || "").toLowerCase();
            const key = `option${i + 1}` as "option1" | "option2" | "option3";
            if (name.includes("size") || name.includes("размер")) {
              sizeKey = key;
            } else if (name.includes("color") || name.includes("colour") || name.includes("цвет")) {
              colorKey = key;
            }
          }
        }

        for (const sv of sp.variants) {
          const sku = sv.sku || sv.id.toString();

          let size = sizeKey ? sv[sizeKey] : colorKey === "option1" ? sv.option2 : sv.option1;
          let color = colorKey ? sv[colorKey] : sizeKey === "option1" ? sv.option2 : sv.option1;

          size = size || "OS";
          color = color || "DEFAULT";

          const rawPrice = parseFloat(sv.price);
          const availability: AvailabilityStatus = sv.available ? "IN_STOCK" : "OUT_OF_STOCK";

          const normalizedPrice = getNormalizedPrice(rawPrice, brand.defaultCurrency);

          await prisma.productVariant.upsert({
            where: {
              productId_size_color: {
                productId: product.id,
                size,
                color,
              },
            },
            update: {
              availability,
              rawPrice,
              currency: brand.defaultCurrency,
              normalizedPrice,
              sku,
            },
            create: {
              productId: product.id,
              externalId: sv.id.toString(),
              size,
              color,
              sku,
              availability,
              rawPrice,
              currency: brand.defaultCurrency,
              normalizedPrice,
            },
          });
        }
        processedCount++;
      } catch (err) {
        console.error(`[Serverless Ingestor] Product error ${sp.id}:`, err);
      }
    }
  }

  // Update status to ACTIVE if no more pages left, otherwise keep SYNCING
  await prisma.brand.update({
    where: { id: brand.id },
    data: { syncStatus: hasMore ? "SYNCING" : "ACTIVE" },
  });

  return {
    page,
    processedCount,
    hasMore,
    nextPage: hasMore ? page + 1 : undefined,
  };
}

export async function syncBrandServerless(brandId: string): Promise<number> {
  const result = await syncBrandChunkServerless(brandId, 1, 250);
  return result.processedCount;
}
