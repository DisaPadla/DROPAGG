import { prisma } from "./prisma";

export async function ensureTablesExist() {
  try {
    // 1. Create Enums if they don't exist
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "PlatformType" AS ENUM ('SHOPIFY', 'WOOCOMMERCE', 'TILDA', 'OPENCART', 'CUSTOM');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "AvailabilityStatus" AS ENUM ('IN_STOCK', 'OUT_OF_STOCK');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // 2. Create User table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "User" (
        "id" TEXT PRIMARY KEY,
        "email" TEXT UNIQUE NOT NULL,
        "name" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. Create Brand table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Brand" (
        "id" TEXT PRIMARY KEY,
        "name" TEXT NOT NULL,
        "domain" TEXT UNIQUE NOT NULL,
        "platformType" "PlatformType" NOT NULL,
        "syncStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
        "baseCountry" TEXT NOT NULL,
        "defaultCurrency" TEXT NOT NULL,
        "lastPolledHash" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 4. Create UserBrand table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "UserBrand" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
        "brandId" TEXT NOT NULL REFERENCES "Brand"("id") ON DELETE CASCADE,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "UserBrand_userId_brandId_key" UNIQUE ("userId", "brandId")
      );
    `);

    // 5. Create Product table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Product" (
        "id" TEXT PRIMARY KEY,
        "brandId" TEXT NOT NULL REFERENCES "Brand"("id") ON DELETE CASCADE,
        "canonicalUrl" TEXT UNIQUE NOT NULL,
        "externalId" TEXT,
        "title" TEXT NOT NULL,
        "description" TEXT,
        "category" TEXT,
        "mainImage" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 6. Create ProductVariant table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ProductVariant" (
        "id" TEXT PRIMARY KEY,
        "productId" TEXT NOT NULL REFERENCES "Product"("id") ON DELETE CASCADE,
        "externalId" TEXT,
        "size" TEXT,
        "color" TEXT,
        "sku" TEXT,
        "availability" "AvailabilityStatus" NOT NULL DEFAULT 'OUT_OF_STOCK',
        "rawPrice" DECIMAL(10, 2) NOT NULL,
        "currency" TEXT NOT NULL,
        "normalizedPrice" DECIMAL(10, 2),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ProductVariant_productId_size_color_key" UNIQUE ("productId", "size", "color")
      );
    `);

    // 7. Create ExchangeRate table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ExchangeRate" (
        "id" SERIAL PRIMARY KEY,
        "baseCurrency" TEXT NOT NULL DEFAULT 'USD',
        "targetCurrency" TEXT UNIQUE NOT NULL,
        "rate" DECIMAL(18, 6) NOT NULL,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 8. Create DropEvent table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "DropEvent" (
        "id" TEXT PRIMARY KEY,
        "variantId" TEXT NOT NULL REFERENCES "ProductVariant"("id") ON DELETE CASCADE,
        "previousStatus" "AvailabilityStatus" NOT NULL,
        "newStatus" "AvailabilityStatus" NOT NULL,
        "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log("[DB Init] All database tables verified and created successfully.");
    return true;
  } catch (err) {
    console.error("[DB Init Error]", err);
    return false;
  }
}
