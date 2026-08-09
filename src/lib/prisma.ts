import 'dotenv/config';
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { meiliClient, PRODUCTS_INDEX } from "./meilisearch";

const globalForPrisma = global as unknown as { prisma: any; prismaBase: PrismaClient };

export const prisma = globalForPrisma.prisma || (() => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prismaBase = new PrismaClient({ adapter });
  globalForPrisma.prismaBase = prismaBase; // Cache it for upsert

  return prismaBase.$extends({
    query: {
      product: {
        async upsert({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          // Execute the actual DB query
          const result = await query(args);
          
          // Fetch the full product with its variants and brand for the search index
          const fullProduct = await prismaBase.product.findUnique({
            where: { id: result.id },
            include: {
              brand: true,
              variants: true
            }
          });

          if (fullProduct) {
            try {
              const sizes = Array.from(new Set(fullProduct.variants.map(v => v.size).filter(Boolean)));
              const minPrice = Math.min(...fullProduct.variants.map(v => Number(v.rawPrice)));
              const hasStock = fullProduct.variants.some(v => v.availability === 'IN_STOCK');

              await meiliClient.index(PRODUCTS_INDEX).addDocuments([{
                id: fullProduct.id,
                title: fullProduct.title,
                description: fullProduct.description,
                category: fullProduct.category,
                brandName: fullProduct.brand.name,
                brandDomain: fullProduct.brand.domain,
                mainImage: fullProduct.mainImage,
                canonicalUrl: fullProduct.canonicalUrl,
                sizes: sizes,
                minPrice: isFinite(minPrice) ? minPrice : 0,
                inStock: hasStock,
                createdAt: Math.floor(fullProduct.createdAt.getTime() / 1000)
              }]);
            } catch (err) {
              console.warn("[Meilisearch Sync Warning] Failed to index product:", err);
            }
          }

          return result;
        }
      }
    }
  });
})();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
