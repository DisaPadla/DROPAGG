"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { CatalogFilters } from "@/components/catalog/catalog-filters";
import { PGliteCatalogView } from "@/components/catalog/pglite-catalog-view";
import { WelcomeScreen } from "@/components/home/welcome-screen";
import { CatalogSort } from "@/components/catalog/catalog-sort";
import { filterProductsByGender } from "@/lib/gender-classifier";
import {
  filterProductsBySizeAndStock,
  extractAvailableSizes,
  STANDARD_SIZES,
} from "@/lib/size-filter";
import { useLocalCatalog } from "@/lib/local-db";
import { useLanguage } from "@/context/language-context";

function HomeCatalogContent() {
  const searchParams = useSearchParams();
  const { t } = useLanguage();
  const { hydrated, brands: localBrands, products: localProducts } = useLocalCatalog();

  const brandNames = useMemo(
    () => Array.from(new Set(localBrands.map((b) => b.name))),
    [localBrands]
  );

  const availableCategories = useMemo(() => {
    const raw = localProducts
      .map((p) => p.category)
      .filter((c): c is string => Boolean(c && c.trim() !== ""));
    return raw.length > 0
      ? Array.from(new Set<string>(raw))
      : ["Hoodies", "T-Shirts", "Jackets", "Pants", "Accessories"];
  }, [localProducts]);

  const availableSizes = useMemo(() => {
    const extracted = extractAvailableSizes(localProducts);
    return extracted.length > 0 ? extracted : [...STANDARD_SIZES];
  }, [localProducts]);

  const categoriesParam = searchParams.get("categories");
  const categoryParam = searchParams.get("category");
  const categoryFilters = useMemo(
    () =>
      categoriesParam
        ? categoriesParam.split(",").filter(Boolean)
        : categoryParam
        ? [categoryParam]
        : [],
    [categoriesParam, categoryParam]
  );

  const brandsParam = searchParams.get("brands");
  const brandFilters = useMemo(
    () => (brandsParam ? brandsParam.split(",").filter(Boolean) : []),
    [brandsParam]
  );
  const maxPriceParam = searchParams.get("maxPrice");
  const maxPriceFilter = maxPriceParam ? parseFloat(maxPriceParam) : undefined;
  const sortBy = searchParams.get("sortBy") || "newest_drops";
  const genderFilter = searchParams.get("gender") || "all";
  const sizesParam = searchParams.get("sizes");
  const sizeFilters = useMemo(
    () => (sizesParam ? sizesParam.split(",").filter(Boolean) : []),
    [sizesParam]
  );
  const inStockOnly = searchParams.get("inStock") === "true";

  // Sort by newest_stores if selected
  const sortedProducts = useMemo(() => {
    if (sortBy === "newest_stores") {
      const brandOrder = new Map<string, number>();
      localBrands.forEach((b, idx) => {
        brandOrder.set(b.id, idx);
        brandOrder.set(b.name, idx);
      });
      return [...localProducts].sort((a, b) => {
        const orderA =
          brandOrder.get(a.brandId || "") ??
          brandOrder.get(a.brand?.name || "") ??
          9999;
        const orderB =
          brandOrder.get(b.brandId || "") ??
          brandOrder.get(b.brand?.name || "") ??
          9999;
        if (orderA !== orderB) return orderA - orderB;
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });
    }
    return localProducts;
  }, [localProducts, localBrands, sortBy]);

  // Compute filtered count for header display
  const filteredCount = useMemo(() => {
    let list = sortedProducts;
    if (brandFilters.length > 0) {
      list = list.filter((p) => p.brand?.name && brandFilters.includes(p.brand.name));
    }
    if (categoryFilters.length > 0) {
      const lowerCats = categoryFilters.map((c) => c.toLowerCase());
      list = list.filter((p) => {
        const prodCat = (p.category || "").toLowerCase();
        return lowerCats.some((cat) => prodCat.includes(cat));
      });
    }
    list = filterProductsByGender(list, genderFilter);
    list = filterProductsBySizeAndStock(list, sizeFilters, inStockOnly, maxPriceFilter);
    return list.length;
  }, [
    sortedProducts,
    brandFilters,
    categoryFilters,
    genderFilter,
    sizeFilters,
    inStockOnly,
    maxPriceFilter,
  ]);

  if (!hydrated) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row gap-8">
          <div className="w-full md:w-64 h-96 bg-muted/30 animate-pulse rounded-xl" />
          <div className="flex-1 h-96 bg-muted/30 animate-pulse rounded-xl" />
        </div>
      </div>
    );
  }

  // If 0 brands exist on the user's device, show Welcome Screen!
  if (localBrands.length === 0) {
    return <WelcomeScreen />;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row gap-8">
        {/* Interactive Filters Sidebar */}
        <Suspense fallback={<div className="w-full md:w-64 h-96 bg-zinc-900/40 animate-pulse rounded-xl" />}>
          <CatalogFilters
            availableCategories={availableCategories}
            availableBrands={brandNames}
            availableSizes={availableSizes}
            maxPriceLimit={500}
          />
        </Suspense>

        {/* Local Product Grid */}
        <div className="flex-1">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                {t.allDrops || "All Drops"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {filteredCount} {t.results || "Results"}
              </p>
            </div>

            <Suspense fallback={<div className="w-32 h-10 bg-zinc-900/40 animate-pulse rounded-md" />}>
              <CatalogSort />
            </Suspense>
          </div>

          <Suspense fallback={<div className="w-full h-96 bg-zinc-900/40 animate-pulse rounded-xl" />}>
            <PGliteCatalogView
              initialProducts={sortedProducts}
              availableCategories={availableCategories}
              availableBrands={brandNames}
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
    </div>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto px-4 py-8">
          <div className="w-full h-96 bg-muted/30 animate-pulse rounded-xl" />
        </div>
      }
    >
      <HomeCatalogContent />
    </Suspense>
  );
}
