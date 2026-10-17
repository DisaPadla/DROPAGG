import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { ensureTablesExist } from "@/lib/db-init";
import { getCurrentUser, SessionUser } from "@/lib/session";
import { CatalogFilters } from "@/components/catalog/catalog-filters";
import { PGliteCatalogView } from "@/components/catalog/pglite-catalog-view";
import { FeedTabs, EmptyRadarState, GlobalBrandSummary } from "@/components/catalog/feed-tabs";
import { WelcomeScreen } from "@/components/home/welcome-screen";
import { CatalogSort } from "@/components/catalog/catalog-sort";
import { filterProductsByGender } from "@/lib/gender-classifier";
import {
  filterProductsBySizeAndStock,
  extractAvailableSizes,
  getEffectiveProductPrice,
  STANDARD_SIZES,
} from "@/lib/size-filter";
import { getProductDropBadges, RESTOCK_WINDOW_MS } from "@/lib/drop-events";
import { resolveVariantCurrency, getVariantPriceInUsd } from "@/lib/currency";
import { Product, ProductVariant, Brand, DropEvent, Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

type ProductWithRelations = Product & {
  brand: Brand;
  variants: (ProductVariant & { dropEvents?: DropEvent[] })[];
};

function getRecentDropCutoff(): Date {
  return new Date(Date.now() - RESTOCK_WINDOW_MS);
}

interface HomePageProps {
  searchParams: Promise<{
    feed?: string;
    categories?: string;
    category?: string;
    brands?: string;
    maxPrice?: string;
    sortBy?: string;
    gender?: string;
    sizes?: string;
    inStock?: string;
  }>;
}

export default async function Home({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const activeFeed: "explore" | "radar" = params.feed === "radar" ? "radar" : "explore";

  let currentUser: SessionUser | undefined;
  let dbBrands: { id: string; name: string; domain: string; _count?: { products: number } }[] = [];
  let userBrandRows: { brandId: string; brand: { id: string; name: string } }[] = [];

  try {
    currentUser = await getCurrentUser();
    [dbBrands, userBrandRows] = await Promise.all([
      prisma.brand.findMany({
        select: {
          id: true,
          name: true,
          domain: true,
          _count: { select: { products: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.userBrand.findMany({
        where: { userId: currentUser.id },
        include: { brand: { select: { id: true, name: true } } },
      }),
    ]);
  } catch (err) {
    console.warn(
      "[Home Page] Tables missing or DB error, auto-initializing Supabase tables...",
      err instanceof Error ? err.message : String(err)
    );
    await ensureTablesExist();
    try {
      currentUser = await getCurrentUser();
      [dbBrands, userBrandRows] = await Promise.all([
        prisma.brand.findMany({
          select: {
            id: true,
            name: true,
            domain: true,
            _count: { select: { products: true } },
          },
          orderBy: { createdAt: "desc" },
        }),
        prisma.userBrand.findMany({
          where: { userId: currentUser.id },
          include: { brand: { select: { id: true, name: true } } },
        }),
      ]);
    } catch (retryErr) {
      console.error("[Home Page] Failed to query brands after auto-init:", retryErr);
    }
  }

  const globalBrandNames = Array.from(new Set(dbBrands.map((b) => b.name)));
  const allGlobalBrands: GlobalBrandSummary[] = dbBrands.map((b) => ({
    id: b.id,
    name: b.name,
    domain: b.domain,
    productsCount: b._count?.products || 0,
  }));

  const radarBrandIds = userBrandRows.map((ub) => ub.brandId);
  const radarBrandNames = Array.from(
    new Set(userBrandRows.map((ub) => ub.brand?.name).filter((n): n is string => Boolean(n)))
  );

  // If 0 brands exist in the entire global catalog, show Welcome Screen!
  if (globalBrandNames.length === 0) {
    return <WelcomeScreen />;
  }

  const brands = activeFeed === "radar" ? radarBrandNames : globalBrandNames;

  const categoryFilters = params.categories
    ? params.categories.split(",").filter(Boolean)
    : params.category
    ? [params.category]
    : [];

  const brandFilters = params.brands ? params.brands.split(",").filter(Boolean) : [];
  const maxPriceFilter = params.maxPrice ? parseFloat(params.maxPrice) : undefined;
  const sortBy = params.sortBy || "newest_drops";
  const genderFilter = params.gender || "all";
  const sizeFilters = params.sizes ? params.sizes.split(",").filter(Boolean) : [];
  const inStockOnly = params.inStock === "true";

  const where: Prisma.ProductWhereInput = {};

  if (activeFeed === "radar") {
    if (brandFilters.length > 0) {
      where.brand = {
        id: { in: radarBrandIds },
        name: { in: brandFilters },
      };
    } else {
      where.brandId = { in: radarBrandIds };
    }
  } else if (brandFilters.length > 0) {
    where.brand = { name: { in: brandFilters } };
  }

  if (categoryFilters.length > 0) {
    where.OR = categoryFilters.map((cat: string) => ({
      category: { contains: cat, mode: "insensitive" },
    }));
  }

  const variantConditions: Prisma.ProductVariantWhereInput[] = [];

  if (inStockOnly || sizeFilters.length > 0) {
    variantConditions.push({
      availability: "IN_STOCK",
    });
  }

  if (variantConditions.length > 0) {
    where.variants = {
      some: variantConditions.length === 1 ? variantConditions[0] : { AND: variantConditions },
    };
  }

  let orderBy: Prisma.ProductOrderByWithRelationInput | Prisma.ProductOrderByWithRelationInput[] = {
    createdAt: "desc",
  };
  if (sortBy === "newest_stores") {
    orderBy = [
      { brand: { createdAt: "desc" } },
      { createdAt: "desc" },
    ];
  }

  let rawProducts: ProductWithRelations[] = [];
  const productInclude = {
    variants: {
      include: {
        dropEvents: {
          where: {
            detectedAt: {
              gte: getRecentDropCutoff(),
            },
          },
          orderBy: { detectedAt: "desc" as const },
          take: 20,
        },
      },
    },
    brand: true,
  };

  try {
    rawProducts = await prisma.product.findMany({
      where,
      include: productInclude,
      orderBy,
    });
  } catch (err) {
    console.warn("[Home Page] Product query failed, running ensureTablesExist() to apply schema updates...", err);
    await ensureTablesExist();
    try {
      rawProducts = await prisma.product.findMany({
        where,
        include: productInclude,
        orderBy,
      });
    } catch (retryErr) {
      console.error("[Home Page] Failed to query products after schema migration:", retryErr);
    }
  }

  // Serialize Decimal objects and Date objects for React Server Component boundary
  let products = rawProducts.map((p) => {
    const brandDefaultCurrency = p.brand?.defaultCurrency || "USD";
    const serialized = {
      ...p,
      createdAt: p.createdAt ? p.createdAt.toISOString() : null,
      updatedAt: p.updatedAt ? p.updatedAt.toISOString() : null,
      variants: p.variants ? p.variants.map((v) => {
        const rawPrice = v.rawPrice ? Number(v.rawPrice) : 0;
        const rawNormPrice = v.normalizedPrice ? Number(v.normalizedPrice) : 0;
        const currency = resolveVariantCurrency(v, brandDefaultCurrency);
        const normalizedPrice = getVariantPriceInUsd(
          { rawPrice, normalizedPrice: rawNormPrice, currency },
          brandDefaultCurrency
        );
        return {
          ...v,
          rawPrice,
          compareAtPrice: v.compareAtPrice ? Number(v.compareAtPrice) : null,
          currency,
          normalizedPrice,
          createdAt: v.createdAt ? v.createdAt.toISOString() : null,
          updatedAt: v.updatedAt ? v.updatedAt.toISOString() : null,
          dropEvents: v.dropEvents ? v.dropEvents.map((de) => ({
            ...de,
            detectedAt: de.detectedAt
              ? typeof de.detectedAt === "string"
                ? de.detectedAt
                : de.detectedAt.toISOString()
              : null,
          })) : [],
        };
      }) : [],
      brand: p.brand ? {
        ...p.brand,
        createdAt: p.brand.createdAt ? p.brand.createdAt.toISOString() : null,
        updatedAt: p.brand.updatedAt ? p.brand.updatedAt.toISOString() : null,
      } : null,
    };

    const badges = getProductDropBadges(serialized);
    return {
      ...serialized,
      isNewDrop: badges.isNewDrop,
      isRestocked: badges.isRestocked,
      hasPriceDrop: badges.hasPriceDrop,
      restockedSizes: badges.restockedSizes,
    };
  });

  // Apply strict gender filtering
  products = filterProductsByGender(products, genderFilter);

  // Apply strict size and in-stock filtering (verifying availability === "IN_STOCK" for matching sizes)
  products = filterProductsBySizeAndStock(products, sizeFilters, inStockOnly, maxPriceFilter);

  // Handle price sorting in Server Component
  if (sortBy === "price_asc") {
    products.sort((a, b) => {
      return (
        getEffectiveProductPrice(a, sizeFilters, inStockOnly) -
        getEffectiveProductPrice(b, sizeFilters, inStockOnly)
      );
    });
  } else if (sortBy === "price_desc") {
    products.sort((a, b) => {
      return (
        getEffectiveProductPrice(b, sizeFilters, inStockOnly) -
        getEffectiveProductPrice(a, sizeFilters, inStockOnly)
      );
    });
  }

  // Get distinct categories and sizes from local database (scoped to user's radar in radar mode)
  let dbCategories: { category: string | null }[] = [];
  let dbSizes: { size: string | null; availability?: string | null }[] = [];
  try {
    const categoryWhere = activeFeed === "radar" ? { brandId: { in: radarBrandIds } } : {};
    const sizeWhere =
      activeFeed === "radar"
        ? { availability: "IN_STOCK" as const, product: { brandId: { in: radarBrandIds } } }
        : { availability: "IN_STOCK" as const };

    [dbCategories, dbSizes] = await Promise.all([
      prisma.product.findMany({
        where: categoryWhere,
        select: { category: true },
        distinct: ["category"],
      }),
      prisma.productVariant.findMany({
        where: sizeWhere,
        select: { size: true, availability: true },
        distinct: ["size"],
      }),
    ]);
  } catch (err) {
    console.error("[Home Page] Failed to query categories/sizes:", err);
  }

  const rawCategories = dbCategories
    .map((c: { category: string | null }) => c.category)
    .filter((c: string | null): c is string => !!c && c.trim() !== "");

  const availableCategories =
    rawCategories.length > 0
      ? Array.from(new Set<string>(rawCategories))
      : ["Hoodies", "T-Shirts", "Jackets", "Pants", "Accessories"];

  const availableSizes =
    dbSizes.length > 0
      ? extractAvailableSizes([{ variants: dbSizes }])
      : [...STANDARD_SIZES];

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Explore (Global Catalog) vs My Radar (Personal UserBrand Feed) Switcher */}
      <Suspense fallback={<div className="w-full h-14 bg-zinc-900/40 animate-pulse rounded-xl mb-6" />}>
        <FeedTabs
          activeFeed={activeFeed}
          totalGlobalBrands={globalBrandNames.length}
          radarBrandsCount={radarBrandNames.length}
          currentUser={currentUser}
        />
      </Suspense>

      {activeFeed === "radar" && radarBrandIds.length === 0 ? (
        <Suspense fallback={<div className="w-full h-80 bg-zinc-900/40 animate-pulse rounded-2xl" />}>
          <EmptyRadarState globalBrands={allGlobalBrands} />
        </Suspense>
      ) : (
        <div className="flex flex-col md:flex-row gap-8">
          
          {/* Interactive Filters Sidebar wrapped in Suspense */}
          <Suspense fallback={<div className="w-full md:w-64 h-96 bg-zinc-900/40 animate-pulse rounded-xl" />}>
            <CatalogFilters
              availableCategories={availableCategories}
              availableBrands={brands}
              availableSizes={availableSizes}
              maxPriceLimit={500}
            />
          </Suspense>

          {/* Product Grid Powered by PGlite WASM Postgres */}
          <div className="flex-1">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">
                  {activeFeed === "radar" ? "My Radar Drops" : "Explore All Drops"}
                </h1>
                <p className="text-sm text-muted-foreground">{products.length} Results</p>
              </div>

              {/* Interactive Sort Control wrapped in Suspense */}
              <Suspense fallback={<div className="w-32 h-10 bg-zinc-900/40 animate-pulse rounded-md" />}>
                <CatalogSort />
              </Suspense>
            </div>

            <Suspense fallback={<div className="w-full h-96 bg-zinc-900/40 animate-pulse rounded-xl" />}>
              <PGliteCatalogView
                userId={currentUser?.id}
                initialProducts={products}
                availableCategories={availableCategories}
                availableBrands={brands}
                selectedBrands={brandFilters}
                selectedCategories={categoryFilters}
                selectedSizes={sizeFilters}
                inStockOnly={inStockOnly}
                maxPriceFilter={maxPriceFilter}
                sortBy={sortBy}
                selectedGender={genderFilter}
              />
            </Suspense>
          </div>

        </div>
      )}
    </div>
  );
}

