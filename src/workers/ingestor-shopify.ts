import { Worker, Job } from "bullmq";
import Redis from "ioredis";
import * as cheerio from "cheerio";
import { AvailabilityStatus } from "@prisma/client";
import { ingestionQueueName } from "../lib/queue";
import { prisma } from "../lib/prisma";
import { extractMetadata } from "../lib/tier2-extractor";
import { inferCategory } from "../lib/category-classifier";

const connection = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379", {
  maxRetriesPerRequest: null,
});

export const shopifyIngestorWorker = new Worker(
  ingestionQueueName,
  async (job: Job) => {
    const { brandId, feedUrl, platformType } = job.data;

    const brand = await prisma.brand.findUnique({ where: { id: brandId } });
    if (!brand) throw new Error("Brand not found");

    // We need exchange rates to normalize prices
    const rates = await prisma.exchangeRate.findMany();
    const rateMap = new Map(rates.map((r: { targetCurrency: string; rate: any }) => [r.targetCurrency, Number(r.rate)]));

    const getNormalizedPrice = (price: number, currency: string): number => {
      if (currency === "USD") return price;
      const rate = rateMap.get(currency);
      return rate ? price / Number(rate) : price;
    };

    // Tier 2 Web Scraper for Non-Shopify Brands (Wix, Tilda, Custom)
    if (platformType !== "SHOPIFY") {
      console.log(`[Ingestor] Running Tier 2 Web Scraper for ${brand.name} (${platformType})...`);
      
      const targetUrl = `https://${brand.domain}`;
      const res = await fetch(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        }
      });
      const html = await res.text();
      const $ = cheerio.load(html);

      const productUrls = new Set<string>();
      $("a").each((_, el) => {
        const href = $(el).attr("href");
        if (href && (href.includes("/product") || href.includes("/tproduct") || href.includes("/item") || href.includes("/shop/") || href.includes("/catalog/"))) {
          const fullUrl = href.startsWith("http") ? href : `https://${brand.domain}${href.startsWith("/") ? "" : "/"}${href}`;
          productUrls.add(fullUrl);
        }
      });

      console.log(`[Ingestor] Discovered ${productUrls.size} potential product links for ${brand.name}.`);

      let count = 0;
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
            }
          });

          const rawPrice = meta.price;
          const currency = meta.currency || brand.defaultCurrency;
          const normalizedPrice = getNormalizedPrice(rawPrice, currency);

          await prisma.productVariant.upsert({
            where: {
              productId_size_color: {
                productId: product.id,
                size: "OS",
                color: "DEFAULT"
              }
            },
            update: {
              availability: "IN_STOCK",
              rawPrice,
              currency,
              normalizedPrice
            },
            create: {
              productId: product.id,
              externalId: meta.url,
              size: "OS",
              color: "DEFAULT",
              availability: "IN_STOCK",
              rawPrice,
              currency,
              normalizedPrice
            }
          });
          count++;
        } catch (e) {
          console.error(`[Ingestor] Failed processing ${prodUrl}:`, e);
        }
      }

      await prisma.brand.update({
        where: { id: brand.id },
        update: { syncStatus: "ACTIVE" }
      });

      console.log(`[Ingestor] Finished Tier 2 scraping for ${brand.name}. Processed ${count} items.`);
      return;
    }

    // Tier 1 Shopify JSON Ingestion
    console.log(`[Ingestor] Starting heavy ingestion for Shopify brand ${brand.name}...`);

    try {
      const response = await fetch(feedUrl);
      if (!response.ok) throw new Error(`Failed to fetch Shopify feed: ${response.statusText}`);
      
      const data = await response.json();
      const products = data.products || [];

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
            }
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
            
            let size = sizeKey ? sv[sizeKey] : (colorKey === "option1" ? sv.option2 : sv.option1);
            let color = colorKey ? sv[colorKey] : (sizeKey === "option1" ? sv.option2 : sv.option1);

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
                }
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
              }
            });
          }
        } catch (err) {
          console.error(`[Ingestor] Error processing product ${sp.id}:`, err);
        }
      }

      await prisma.brand.update({
        where: { id: brand.id },
        update: { syncStatus: "ACTIVE" }
      });

      console.log(`[Ingestor] Ingestion completed for ${brand.name}. Total products: ${products.length}`);
    } catch (error) {
      console.error(`[Ingestor] Job failed for brand ${brand.name}:`, error);
      await prisma.brand.update({
        where: { id: brand.id },
        update: { syncStatus: "FAILED" }
      });
      throw error;
    }
  },
  { connection }
);
