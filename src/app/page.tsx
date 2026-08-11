import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { ensureTablesExist } from "@/lib/db-init";
import { CatalogFilters } from "@/components/catalog/catalog-filters";
import { PGliteCatalogView } from "@/components/catalog/pglite-catalog-view";
import { WelcomeScreen } from "@/components/home/welcome-screen";
import { CatalogSort } from "@/components/catalog/catalog-sort";
import { filterProductsByGender } from "@/lib/gender-classifier";
import { Product, ProductVariant, Brand } from "@prisma/client";

export const dynamic = "force-dynamic";

type ProductWithRelations = Product & {
  brand: Brand;
  variants: ProductVariant[];
};

interface HomePageProps {
  searchParams: Promise<{
    categories?: string;
    category?: string;
    brands?: string;
    maxPrice?: string;
    sortBy?: string;
    gender?: string;
  }>;
}

export default async function Home({ searchParams }: HomePageProps) {
  const params = await searchParams;

  let dbBrands: { name: string }[] = [];
  try {
    dbBrands = await prisma.brand.findMany({
      select: { name: true },
      distinct: ["name"],
    });
  } catch (err: any) {
    console.warn("[Home Page] Tables missing or DB error, auto-initializing Supabase tables...", err.message);
    await ensureTablesExist();
    try {
      dbBrands = await prisma.brand.findMany({
        select: { name: true },
        distinct: ["name"],
      });
    } catch (retryErr) {
      console.error("[Home Page] Failed to query brands after auto-init:", retryErr);
    }
  }

  const brands = dbBrands.map((b: { name: string }) => b.name);

  // If first-time user / 0 brands added, show Welcome Screen!
  if (brands.length === 0) {
    return <WelcomeScreen />;
  }

  const categoryFilters = params.categories
    ? params.categories.split(",").filter(Boolean)
    : params.category
    ? [params.category]
    : [];

  const brandFilters = params.brands ? params.brands.split(",").filter(Boolean) : [];
  const maxPriceFilter = params.maxPrice ? parseFloat(params.maxPrice) : undefined;
  const sortBy = params.sortBy || "newest_drops";
  const genderFilter = params.gender || "all";

  const where: any = {};

  if (brandFilters.length > 0) {
    where.brand = { name: { in: brandFilters } };
  }

  if (categoryFilters.length > 0) {
    where.OR = categoryFilters.map((cat: string) => ({
      category: { contains: cat, mode: "insensitive" },
    }));
  }

  if (maxPriceFilter !== undefined) {
    where.variants = {
      some: {
        OR: [
          { normalizedPrice: { lte: maxPriceFilter } },
          { rawPrice: { lte: maxPriceFilter } },
        ],
      },
    };
  }

  let orderBy: any = { createdAt: "desc" };
  if (sortBy === "newest_stores") {
    orderBy = [
      { brand: { createdAt: "desc" } },
      { createdAt: "desc" },
    ];
  }

  let rawProducts: ProductWithRelations[] = [];
  try {
    rawProducts = await prisma.product.findMany({
      where,
      include: { variants: true, brand: true },
      orderBy,
    });
  } catch (err) {
    console.error("[Home Page] Failed to query products:", err);
  }

  // Serialize Decimal objects and Date objects for React Server Component boundary
  let products = rawProducts.map((p: any) => ({
    ...p,
    createdAt: p.createdAt ? p.createdAt.toISOString() : null,
    updatedAt: p.updatedAt ? p.updatedAt.toISOString() : null,
    variants: p.variants ? p.variants.map((v: any) => ({
      ...v,
      rawPrice: v.rawPrice ? Number(v.rawPrice) : 0,
      normalizedPrice: v.normalizedPrice ? Number(v.normalizedPrice) : 0,
      createdAt: v.createdAt ? v.createdAt.toISOString() : null,
      updatedAt: v.updatedAt ? v.updatedAt.toISOString() : null,
    })) : [],
    brand: p.brand ? {
      ...p.brand,
      createdAt: p.brand.createdAt ? p.brand.createdAt.toISOString() : null,
      updatedAt: p.brand.updatedAt ? p.brand.updatedAt.toISOString() : null,
    } : null,
  }));

  // Apply strict gender filtering
  products = filterProductsByGender(products, genderFilter);

  // Handle price sorting in Server Component
  if (sortBy === "price_asc") {
    products.sort((a, b) => {
      const priceA = Number(a.variants?.[0]?.normalizedPrice || a.variants?.[0]?.rawPrice || 0);
      const priceB = Number(b.variants?.[0]?.normalizedPrice || b.variants?.[0]?.rawPrice || 0);
      return priceA - priceB;
    });
  } else if (sortBy === "price_desc") {
    products.sort((a, b) => {
      const priceA = Number(a.variants?.[0]?.normalizedPrice || a.variants?.[0]?.rawPrice || 0);
      const priceB = Number(b.variants?.[0]?.normalizedPrice || b.variants?.[0]?.rawPrice || 0);
      return priceB - priceA;
    });
  }

  // Get distinct categories from local database
  let dbCategories: { category: string | null }[] = [];
  try {
    dbCategories = await prisma.product.findMany({
      select: { category: true },
      distinct: ["category"],
    });
  } catch (err) {
    console.error("[Home Page] Failed to query categories:", err);
  }

  const rawCategories = dbCategories
    .map((c: { category: string | null }) => c.category)
    .filter((c: string | null): c is string => !!c && c.trim() !== "");

  const availableCategories =
    rawCategories.length > 0
      ? Array.from(new Set<string>(rawCategories))
      : ["Hoodies", "T-Shirts", "Jackets", "Pants", "Accessories"];

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row gap-8">
        
        {/* Interactive Filters Sidebar wrapped in Suspense */}
        <Suspense fallback={<div className="w-full md:w-64 h-96 bg-zinc-900/40 animate-pulse rounded-xl" />}>
          <CatalogFilters
            availableCategories={availableCategories}
            availableBrands={brands}
            maxPriceLimit={500}
          />
        </Suspense>

        {/* Product Grid Powered by PGlite WASM Postgres */}
        <div className="flex-1">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">All Drops</h1>
              <p className="text-sm text-muted-foreground">{products.length} Results</p>
            </div>

            {/* Interactive Sort Control wrapped in Suspense */}
            <Suspense fallback={<div className="w-32 h-10 bg-zinc-900/40 animate-pulse rounded-md" />}>
              <CatalogSort />
            </Suspense>
          </div>

          <Suspense fallback={<div className="w-full h-96 bg-zinc-900/40 animate-pulse rounded-xl" />}>
            <PGliteCatalogView
              initialProducts={products}
              availableCategories={availableCategories}
              availableBrands={brands}
              selectedBrands={brandFilters}
              selectedCategories={categoryFilters}
              maxPriceFilter={maxPriceFilter}
              sortBy={sortBy}
              selectedGender={genderFilter}
            />
          </Suspense>
        </div>

      </div>
    </div>
  );
}
