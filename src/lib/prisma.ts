import 'dotenv/config';
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { meiliClient, PRODUCTS_INDEX } from "./meilisearch";

const globalForPrisma = global as unknown as { prisma: any, prismaBase: PrismaClient };

export const prisma = globalForPrisma.prisma || (() => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prismaBase = new PrismaClient({ adapter });
  globalForPrisma.prismaBase = prismaBase; // Cache it for upsert

  return prismaBase.$extends({
    query: {
      product: {
        async upsert({ args, query }) {
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
            // Format for Meilisearch (Denormalized)
            const searchDoc = {
              id: fullProduct.id,
              title: fullProduct.title,
              brand: fullProduct.brand.name,
              category: fullProduct.category,
              description: fullProduct.description,
              mainImage: fullProduct.mainImage,
              createdAt: fullProduct.createdAt.getTime(),
              // Variants array for facet filtering
              variants: fullProduct.variants.map((v: any) => ({
                size: v.size,
                availability: v.availability,
                normalizedPrice: v.normalizedPrice ? Number(v.normalizedPrice) : null
              }))
            };

            // Push to Meilisearch asynchronously (don't block the DB transaction)
            meiliClient.index(PRODUCTS_INDEX).addDocuments([searchDoc])
              .catch(err => console.error("[Meilisearch Sync Error]", err));
          }

          return result;
        }
      }
    }
  });
})();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
