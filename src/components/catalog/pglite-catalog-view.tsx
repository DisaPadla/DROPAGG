"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Heart, Loader2, Sparkles, RotateCcw } from "lucide-react";
import { useLanguage } from "@/context/language-context";
import { getLocalFavorites, toggleFavorite } from "@/lib/favorites";
import {
  formatProductPrice,
  getProductPriceInUsd,
} from "@/lib/currency";
import {
  appendUtmParams,
  getProductDiscountInfo,
  formatCompareAtPrice,
  trackOutboundClick,
} from "@/lib/utm";
import { filterProductsByGender } from "@/lib/gender-classifier";
import {
  filterProductsBySizeAndStock,
  isVariantSizeSelected,
  getEffectiveProductPrice,
} from "@/lib/size-filter";
import { getProductDropBadges } from "@/lib/drop-events";
import { LocalCatalogProduct, LocalCatalogVariant } from "@/lib/local-first-storage";

interface PGliteCatalogViewProps {
  userId?: string;
  initialProducts: LocalCatalogProduct[];
  availableCategories: string[];
  availableBrands: string[];
  selectedBrands?: string[];
  selectedCategories?: string[];
  selectedSizes?: string[];
  inStockOnly?: boolean;
  maxPriceFilter?: number;
  sortBy?: string;
  selectedGender?: string;
}

const ITEMS_PER_CHUNK = 18;

function PGliteCatalogViewContent({
  initialProducts,
  availableBrands = [],
  selectedBrands = [],
  selectedCategories = [],
  selectedSizes: propSizes,
  inStockOnly: propInStockOnly,
  maxPriceFilter,
  sortBy = "newest_drops",
  selectedGender: propGender,
}: PGliteCatalogViewProps) {
  const { t, currency } = useLanguage();
  void currency;
  const searchParams = useSearchParams();
  const isFavoritesOnly = searchParams.get("favorites") === "true";
  const selectedGender = propGender || searchParams.get("gender") || "all";
  const urlSizesParam = searchParams.get("sizes");
  const urlSizes = urlSizesParam
    ? urlSizesParam.split(",").filter(Boolean)
    : [];
  const activeSizes =
    urlSizesParam !== null
      ? urlSizes
      : propSizes && propSizes.length > 0
      ? propSizes
      : [];
  const urlInStockParam = searchParams.get("inStock");
  const activeInStockOnly =
    urlInStockParam !== null
      ? urlInStockParam === "true"
      : Boolean(propInStockOnly);

  const effectiveBrands =
    selectedBrands.length > 0
      ? availableBrands.length > 0
        ? selectedBrands.filter((b) => availableBrands.includes(b))
        : selectedBrands
      : availableBrands;
  const hasUnmatchedBrandFilter =
    selectedBrands.length > 0 && availableBrands.length > 0 && effectiveBrands.length === 0;

  const availableBrandsKey = JSON.stringify(availableBrands);
  const selectedBrandsKey = JSON.stringify(selectedBrands);
  const selectedCategoriesKey = JSON.stringify(selectedCategories);
  const activeSizesKey = JSON.stringify(activeSizes);
  const filterResetKey = `${availableBrandsKey}|${selectedBrandsKey}|${selectedCategoriesKey}|${activeSizesKey}|${activeInStockOnly}|${maxPriceFilter ?? ""}|${sortBy}|${selectedGender}|${isFavoritesOnly}`;

  const [favorites, setFavorites] = useState<string[]>([]);
  const [visibleCount, setVisibleCount] = useState<number>(ITEMS_PER_CHUNK);
  const [prevFilterResetKey, setPrevFilterResetKey] = useState<string>(filterResetKey);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  if (filterResetKey !== prevFilterResetKey) {
    setPrevFilterResetKey(filterResetKey);
    setVisibleCount(ITEMS_PER_CHUNK);
  }

  useEffect(() => {
    const updateFavs = () => {
      setFavorites(getLocalFavorites());
    };
    updateFavs();

    window.addEventListener("dropagg_favorites_change", updateFavs);
    return () => window.removeEventListener("dropagg_favorites_change", updateFavs);
  }, []);

  let displayProducts = hasUnmatchedBrandFilter
    ? []
    : effectiveBrands.length > 0
    ? initialProducts.filter((p) => !p.brand?.name || effectiveBrands.includes(p.brand.name))
    : initialProducts;

  if (selectedCategories.length > 0) {
    const lowerCats = selectedCategories.map((c) => c.toLowerCase());
    displayProducts = displayProducts.filter((p) => {
      const prodCat = (p.category || "").toLowerCase();
      return lowerCats.some((cat) => prodCat.includes(cat));
    });
  }

  if (isFavoritesOnly) {
    displayProducts = displayProducts.filter((p) => favorites.includes(p.id));
  }

  displayProducts = filterProductsByGender(displayProducts, selectedGender);
  displayProducts = filterProductsBySizeAndStock(
    displayProducts,
    activeSizes,
    activeInStockOnly,
    maxPriceFilter
  );

  if (sortBy === "price_asc") {
    displayProducts = [...displayProducts].sort((a, b) => {
      return (
        (getEffectiveProductPrice(a, activeSizes, activeInStockOnly) || getProductPriceInUsd(a)) -
        (getEffectiveProductPrice(b, activeSizes, activeInStockOnly) || getProductPriceInUsd(b))
      );
    });
  } else if (sortBy === "price_desc") {
    displayProducts = [...displayProducts].sort((a, b) => {
      return (
        (getEffectiveProductPrice(b, activeSizes, activeInStockOnly) || getProductPriceInUsd(b)) -
        (getEffectiveProductPrice(a, activeSizes, activeInStockOnly) || getProductPriceInUsd(a))
      );
    });
  }

  // IntersectionObserver Sentinel for Infinite Scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + ITEMS_PER_CHUNK, displayProducts.length));
        }
      },
      { rootMargin: "400px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [displayProducts.length]);

  const visibleProducts = displayProducts.slice(0, visibleCount);
  const hasMoreVisible = visibleCount < displayProducts.length;

  return (
    <div>
      {displayProducts.length === 0 ? (
        <div className="text-center py-16 bg-muted/20 rounded-2xl border border-dashed">
          <p className="text-muted-foreground font-semibold mb-2">
            {isFavoritesOnly ? t.noFavorites : t.noProducts}
          </p>
          <p className="text-xs text-muted-foreground">
            {isFavoritesOnly
              ? "Click the heart icon on any drop to save it to your local favorites."
              : "Add a store or adjust your filter parameters."}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
            {visibleProducts.map((product) => {
              const isFav = favorites.includes(product.id);
              const isSoldOut =
                product.variants &&
                product.variants.length > 0 &&
                product.variants.every((v: LocalCatalogVariant) => v.availability === "OUT_OF_STOCK");

              const priceText = formatProductPrice(product);
              const discountInfo = getProductDiscountInfo(product);
              const compareAtPriceText = formatCompareAtPrice(product);
              const outboundUrl = appendUtmParams(product.canonicalUrl);
              const dropBadges = getProductDropBadges(product);

              return (
                <a
                  key={product.id}
                  href={outboundUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() =>
                    trackOutboundClick({
                      productId: product.id,
                      brandId: product.brand?.id || product.brandId,
                      brandName: product.brand?.name,
                      targetUrl: outboundUrl,
                      source: "catalog",
                    })
                  }
                  className={`group block transition-all ${isSoldOut ? "opacity-60 grayscale-[0.3]" : ""}`}
                >
                  <Card className="overflow-hidden border-0 bg-transparent shadow-none">
                    <CardContent className="p-0 relative">
                      <div className="aspect-[3/4] overflow-hidden rounded-xl bg-muted relative mb-3">
                        <img
                          src={
                            product.mainImage ||
                            "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&q=80&w=800"
                          }
                          alt={product.title}
                          loading="lazy"
                          decoding="async"
                          className="object-cover w-full h-full transition-transform duration-500 group-hover:scale-105"
                        />
                        <div className="absolute top-2.5 left-2.5 flex flex-col gap-1.5 z-10">
                          <Badge className="bg-background/90 text-foreground backdrop-blur-sm hover:bg-background text-[10px] sm:text-xs py-0.5 px-2 font-bold w-fit">
                            {product.brand?.name}
                          </Badge>
                          {dropBadges.isNewDrop && (
                            <Badge
                              data-badge="new-drop"
                              title={t.newDropTooltip || "New release (dropped within the last 48 hours)"}
                              className="bg-emerald-500/95 hover:bg-emerald-500 text-white border-0 shadow-sm backdrop-blur-sm text-[9px] sm:text-[10px] font-black uppercase tracking-wider py-0.5 px-2 flex items-center gap-1 w-fit"
                            >
                              <Sparkles className="w-2.5 h-2.5 fill-current" />
                              {t.newDrop || "NEW DROP"}
                            </Badge>
                          )}
                          {dropBadges.isRestocked && (
                            <Badge
                              data-badge="restocked"
                              title={
                                dropBadges.restockedSizes.length > 0
                                  ? `${t.restockedTooltip || "Back in stock"}: ${dropBadges.restockedSizes.join(", ")}`
                                  : t.restockedTooltip || "Back in stock"
                              }
                              className="bg-amber-500/95 hover:bg-amber-500 text-black border-0 shadow-sm backdrop-blur-sm text-[9px] sm:text-[10px] font-black uppercase tracking-wider py-0.5 px-2 flex items-center gap-1 w-fit"
                            >
                              <RotateCcw className="w-2.5 h-2.5" />
                              {t.restocked || "RESTOCKED"}
                            </Badge>
                          )}
                          {discountInfo.hasDiscount && discountInfo.discountPercent && (
                            <Badge className="bg-rose-600 text-white hover:bg-rose-600 text-[10px] sm:text-xs py-0.5 px-2 font-black tracking-tight shadow-sm w-fit border-0">
                              -{discountInfo.discountPercent}%
                            </Badge>
                          )}
                          {isSoldOut && (
                            <Badge variant="destructive" className="text-[9px] font-black uppercase py-0.5 px-1.5 w-fit">
                              {t.soldOut || "ПРОДАНО"}
                            </Badge>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleFavorite(product.id);
                            setFavorites(getLocalFavorites());
                          }}
                          className={`absolute top-2.5 right-2.5 z-10 p-2 rounded-full backdrop-blur-md transition-all ${
                            isFav
                              ? "bg-red-500/20 text-red-500 border border-red-500/30"
                              : "bg-background/60 hover:bg-background/90 text-muted-foreground border border-border/40"
                          }`}
                          title={isFav ? "Remove from Favorites" : "Add to Favorites"}
                        >
                          <Heart
                            className={`w-4 h-4 transition-colors ${
                              isFav
                                ? "fill-red-500 text-red-500"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          />
                        </button>

                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center pb-6">
                          <div className="flex flex-wrap gap-1.5 justify-center px-4">
                            {product.variants?.map((v: LocalCatalogVariant) => {
                              const isSizeMatched =
                                v.availability === "IN_STOCK" &&
                                isVariantSizeSelected(v.size, activeSizes);
                              return (
                                <span
                                  key={v.id}
                                  className={`px-2.5 py-1 flex items-center justify-center rounded-md text-xs font-bold ${
                                    isSizeMatched
                                      ? "bg-emerald-400 text-black ring-2 ring-white"
                                      : v.availability === "IN_STOCK"
                                      ? "bg-white text-black"
                                      : "bg-white/30 text-white/50 line-through"
                                  }`}
                                  title={
                                    v.availability === "IN_STOCK"
                                      ? t.inStock
                                      : t.outOfStock
                                  }
                                >
                                  {v.size}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <h3 className="font-medium text-lg leading-tight group-hover:text-primary transition-colors flex items-center justify-between gap-2">
                          <span className="line-clamp-1">{product.title}</span>
                          <ExternalLink className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                        </h3>
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <p
                            className={`font-semibold text-sm ${
                              discountInfo.hasDiscount ? "text-rose-500" : "text-muted-foreground"
                            }`}
                          >
                            {priceText}
                          </p>
                          {discountInfo.hasDiscount && compareAtPriceText && (
                            <span className="text-xs text-muted-foreground/60 line-through font-normal">
                              {compareAtPriceText}
                            </span>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </a>
              );
            })}
          </div>

          {/* Infinite Scroll Sentinel & Counter */}
          <div ref={sentinelRef} className="py-10 text-center flex flex-col items-center justify-center gap-3">
            <p className="text-xs font-medium text-muted-foreground">
              Showing {visibleProducts.length} of {displayProducts.length} items
            </p>

            {hasMoreVisible && (
              <button
                type="button"
                onClick={() => setVisibleCount((prev) => Math.min(prev + ITEMS_PER_CHUNK, displayProducts.length))}
                className="px-4 py-2 rounded-xl bg-muted/50 hover:bg-muted text-xs font-semibold text-foreground transition-all flex items-center gap-2 border"
              >
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                Load More Drops...
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function PGliteCatalogView(props: PGliteCatalogViewProps) {
  return (
    <Suspense fallback={<div className="w-full h-96 bg-muted/40 animate-pulse rounded-xl" />}>
      <PGliteCatalogViewContent {...props} />
    </Suspense>
  );
}
