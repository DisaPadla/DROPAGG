"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getPGliteInstance } from "@/lib/pglite-client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Heart, Loader2, Sparkles, RotateCcw } from "lucide-react";
import { useLanguage } from "@/context/language-context";
import { getLocalFavorites, toggleFavorite } from "@/lib/favorites";
import {
  formatProductPrice,
  getProductPriceInUsd,
  resolveVariantCurrency,
  getVariantPriceInUsd,
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

interface PGliteQueryClient {
  query: <R = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ) => Promise<{ rows?: R[] }>;
}

interface PGliteProductRow {
  id: string;
  title: string;
  description: string | null;
  category: string;
  mainImage: string | null;
  canonicalUrl: string;
  createdAt: string | Date | null;
  brandId: string;
  brandName: string;
  brandDomain: string;
  brandDefaultCurrency: string;
  variants: LocalCatalogVariant[];
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

  // Restrict queried brands to the active feed's availableBrands (e.g. My Radar vs Explore)
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

  const [products, setProducts] = useState<LocalCatalogProduct[]>(initialProducts);
  const [prevInitialProducts, setPrevInitialProducts] =
    useState<LocalCatalogProduct[]>(initialProducts);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [visibleCount, setVisibleCount] = useState<number>(ITEMS_PER_CHUNK);
  const [prevFilterResetKey, setPrevFilterResetKey] = useState<string>(filterResetKey);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  if (initialProducts !== prevInitialProducts) {
    setPrevInitialProducts(initialProducts);
    setProducts(initialProducts);
  }

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

  useEffect(() => {
    let isMounted = true;

    async function syncAndQueryPGlite() {
      try {
        const pglitePromise = getPGliteInstance();
        const timeoutPromise = new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error("PGlite WASM timeout")), 1500)
        );

        const pglite = (await Promise.race([
          pglitePromise,
          timeoutPromise,
        ])) as PGliteQueryClient | null;

        if (!pglite) return;

        if (initialProducts && initialProducts.length > 0) {
          for (const p of initialProducts) {
            if (p.brand) {
              await pglite.query(
                `INSERT INTO brands (id, name, domain, platform_type, sync_status, base_country, default_currency)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 ON CONFLICT (id) DO UPDATE SET name = $2, domain = $3, base_country = $6, default_currency = $7`,
                [
                  p.brand.id,
                  p.brand.name,
                  p.brand.domain,
                  p.brand.platformType || "SHOPIFY",
                  p.brand.syncStatus || "ACTIVE",
                  p.brand.baseCountry || "US",
                  p.brand.defaultCurrency || "",
                ]
              );
            }

            await pglite.query(
              `INSERT INTO products (id, brand_id, canonical_url, external_id, title, description, category, main_image, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
               ON CONFLICT (id) DO UPDATE SET title = $5, category = $7, main_image = $8, canonical_url = $3, created_at = COALESCE($9, products.created_at)`,
              [
                p.id,
                p.brandId,
                p.canonicalUrl || "",
                p.externalId || "",
                p.title,
                p.description || "",
                p.category || "OTHER",
                p.mainImage || "",
                p.createdAt || null,
              ]
            );

            if (p.variants && p.variants.length > 0) {
              const brandCurr = p.brand?.defaultCurrency || "USD";
              for (const v of p.variants) {
                const resolvedCurr = resolveVariantCurrency(v, brandCurr);
                const resolvedNormPrice = getVariantPriceInUsd(v, brandCurr);
                await pglite.query(
                  `INSERT INTO product_variants (id, product_id, size, color, sku, availability, raw_price, compare_at_price, currency, normalized_price)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                   ON CONFLICT (id) DO UPDATE SET availability = $6, raw_price = $7, compare_at_price = $8, currency = $9, normalized_price = $10`,
                  [
                    v.id,
                    p.id,
                    v.size,
                    v.color,
                    v.sku || "",
                    v.availability,
                    v.rawPrice,
                    v.compareAtPrice ?? null,
                    resolvedCurr,
                    resolvedNormPrice,
                  ]
                );

                if (Array.isArray(v.dropEvents)) {
                  for (const de of v.dropEvents) {
                    if (!de?.id) continue;
                    await pglite.query(
                      `INSERT INTO drop_events (id, variant_id, previous_status, new_status, detected_at)
                       VALUES ($1, $2, $3, $4, $5)
                       ON CONFLICT (id) DO NOTHING`,
                      [
                        de.id,
                        v.id,
                        de.previousStatus,
                        de.newStatus,
                        de.detectedAt || null,
                      ]
                    );
                  }
                }
              }
            }
          }
        }

        const parsedAvailBrands: string[] = JSON.parse(availableBrandsKey);
        const parsedSelBrands: string[] = JSON.parse(selectedBrandsKey);
        const parsedSelCategories: string[] = JSON.parse(selectedCategoriesKey);
        const parsedActiveSizes: string[] = JSON.parse(activeSizesKey);

        const queryBrands =
          parsedSelBrands.length > 0
            ? parsedAvailBrands.length > 0
              ? parsedSelBrands.filter((b) => parsedAvailBrands.includes(b))
              : parsedSelBrands
            : parsedAvailBrands;
        const unmatchedBrand =
          parsedSelBrands.length > 0 &&
          parsedAvailBrands.length > 0 &&
          queryBrands.length === 0;

        if (unmatchedBrand) {
          if (isMounted) {
            setProducts([]);
          }
          return;
        }

        // Query PGlite in WASM memory
        const sqlParams: unknown[] = [];
        const conditions: string[] = [];

        if (queryBrands.length > 0) {
          sqlParams.push(queryBrands);
          conditions.push(`b.name = ANY($${sqlParams.length})`);
        }

        if (parsedSelCategories.length > 0) {
          sqlParams.push(parsedSelCategories);
          conditions.push(`p.category = ANY($${sqlParams.length})`);
        }

        if (maxPriceFilter && maxPriceFilter > 0) {
          sqlParams.push(maxPriceFilter);
          conditions.push(
            `EXISTS (
              SELECT 1 FROM product_variants pv_price
              WHERE pv_price.product_id = p.id
                AND pv_price.normalized_price <= $${sqlParams.length}
            )`
          );
        }

        if (activeInStockOnly || parsedActiveSizes.length > 0) {
          conditions.push(
            `EXISTS (
              SELECT 1 FROM product_variants pv_stock
              WHERE pv_stock.product_id = p.id
                AND pv_stock.availability = 'IN_STOCK'
            )`
          );
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

        let orderBy = "p.created_at DESC";
        if (sortBy === "price_asc") {
          orderBy = "MIN(pv.normalized_price) ASC NULLS LAST";
        } else if (sortBy === "price_desc") {
          orderBy = "MAX(pv.normalized_price) DESC NULLS LAST";
        }

        const result = await pglite.query<PGliteProductRow>(
          `SELECT 
            p.id, p.title, p.description, p.category, p.main_image as "mainImage", p.canonical_url as "canonicalUrl", p.created_at as "createdAt",
            b.id as "brandId", b.name as "brandName", b.domain as "brandDomain", b.default_currency as "brandDefaultCurrency",
            COALESCE(
              json_agg(
                json_build_object(
                  'id', pv.id,
                  'size', pv.size,
                  'color', pv.color,
                  'availability', pv.availability,
                  'rawPrice', pv.raw_price,
                  'compareAtPrice', pv.compare_at_price,
                  'currency', pv.currency,
                  'normalizedPrice', pv.normalized_price,
                  'dropEvents', COALESCE(
                    (
                      SELECT json_agg(
                        json_build_object(
                          'id', de.id,
                          'variantId', de.variant_id,
                          'previousStatus', de.previous_status,
                          'newStatus', de.new_status,
                          'detectedAt', de.detected_at
                        )
                        ORDER BY de.detected_at DESC
                      )
                      FROM drop_events de
                      WHERE de.variant_id = pv.id
                    ),
                    '[]'::json
                  )
                )
              ) FILTER (WHERE pv.id IS NOT NULL),
              '[]'::json
            ) as variants
          FROM products p
          JOIN brands b ON p.brand_id = b.id
          LEFT JOIN product_variants pv ON p.id = pv.product_id
          ${whereClause}
          GROUP BY p.id, b.id, b.name, b.domain, b.default_currency
          ORDER BY ${orderBy}`,
          sqlParams
        );

        if (isMounted && result && result.rows) {
          const initialMap = new Map<string, LocalCatalogProduct>(
            (initialProducts || []).map((ip: LocalCatalogProduct) => [ip.id, ip])
          );
          const mapped: LocalCatalogProduct[] = result.rows.map((row: PGliteProductRow) => {
            const initialProd = initialMap.get(row.id);
            const initialVariantMap = new Map<string, LocalCatalogVariant>(
              (initialProd?.variants || []).map((iv: LocalCatalogVariant) => [iv.id, iv])
            );
            const mergedVariants: LocalCatalogVariant[] = (row.variants || []).map(
              (v: LocalCatalogVariant) => {
                const iv = initialVariantMap.get(v.id);
                const dbDropEvents = Array.isArray(v.dropEvents) ? v.dropEvents : [];
                const initialDropEvents = Array.isArray(iv?.dropEvents) ? iv.dropEvents : [];
                return {
                  ...v,
                  rawPrice: v.rawPrice != null ? Number(v.rawPrice) : 0,
                  compareAtPrice: v.compareAtPrice != null ? Number(v.compareAtPrice) : null,
                  normalizedPrice: v.normalizedPrice != null ? Number(v.normalizedPrice) : 0,
                  createdAt: iv?.createdAt ?? v.createdAt ?? null,
                  dropEvents: initialDropEvents.length > 0 ? initialDropEvents : dbDropEvents,
                  isRestocked: iv?.isRestocked,
                };
              }
            );

            const hydratedProduct: LocalCatalogProduct = {
              id: row.id,
              title: row.title,
              description: row.description,
              category: row.category,
              mainImage: row.mainImage,
              canonicalUrl: row.canonicalUrl,
              createdAt:
                initialProd !== undefined
                  ? initialProd.createdAt ?? null
                  : row.createdAt ?? null,
              isNewDrop: initialProd?.isNewDrop,
              isRestocked: initialProd?.isRestocked,
              hasPriceDrop: initialProd?.hasPriceDrop,
              restockedSizes: initialProd?.restockedSizes,
              brand: {
                id: row.brandId,
                name: row.brandName,
                domain: row.brandDomain,
                defaultCurrency: row.brandDefaultCurrency,
              },
              variants: mergedVariants,
            };

            const computedBadges = getProductDropBadges(hydratedProduct);
            return {
              ...hydratedProduct,
              isNewDrop: computedBadges.isNewDrop,
              isRestocked: computedBadges.isRestocked,
              hasPriceDrop: computedBadges.hasPriceDrop,
              restockedSizes: computedBadges.restockedSizes,
            };
          });
          setProducts(mapped);
        }
      } catch (err) {
        console.warn("[PGlite Client View] WASM database query bypassed, using server initial props:", err);
      }
    }

    syncAndQueryPGlite();

    return () => {
      isMounted = false;
    };
  }, [
    initialProducts,
    availableBrandsKey,
    selectedBrandsKey,
    selectedCategoriesKey,
    activeSizesKey,
    activeInStockOnly,
    maxPriceFilter,
    sortBy,
  ]);

  let displayProducts = hasUnmatchedBrandFilter
    ? []
    : effectiveBrands.length > 0
    ? products.filter((p) => !p.brand?.name || effectiveBrands.includes(p.brand.name))
    : products;

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
