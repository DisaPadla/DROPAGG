"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getPGliteInstance } from "@/lib/pglite-client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Heart, Loader2 } from "lucide-react";
import { useLanguage } from "@/context/language-context";
import { getLocalFavorites, toggleFavorite } from "@/lib/favorites";
import { formatProductPrice } from "@/lib/currency";
import { filterProductsByGender } from "@/lib/gender-classifier";

interface PGliteCatalogViewProps {
  userId?: string;
  initialProducts: any[];
  availableCategories: string[];
  availableBrands: string[];
  selectedBrands?: string[];
  selectedCategories?: string[];
  maxPriceFilter?: number;
  sortBy?: string;
  selectedGender?: string;
}

const ITEMS_PER_CHUNK = 18;

function PGliteCatalogViewContent({
  userId,
  initialProducts,
  selectedBrands = [],
  selectedCategories = [],
  maxPriceFilter,
  sortBy = "newest_drops",
  selectedGender: propGender,
}: PGliteCatalogViewProps) {
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const isFavoritesOnly = searchParams.get("favorites") === "true";
  const selectedGender = propGender || searchParams.get("gender") || "all";

  const [products, setProducts] = useState<any[]>(initialProducts);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [visibleCount, setVisibleCount] = useState<number>(ITEMS_PER_CHUNK);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const updateFavs = () => {
      setFavorites(getLocalFavorites());
    };
    updateFavs();

    window.addEventListener("dropagg_favorites_change", updateFavs);
    return () => window.removeEventListener("dropagg_favorites_change", updateFavs);
  }, []);

  useEffect(() => {
    setProducts(initialProducts);
  }, [initialProducts]);

  // Reset pagination window when filters change
  useEffect(() => {
    setVisibleCount(ITEMS_PER_CHUNK);
  }, [
    JSON.stringify(selectedBrands),
    JSON.stringify(selectedCategories),
    maxPriceFilter,
    sortBy,
    selectedGender,
    isFavoritesOnly,
  ]);

  useEffect(() => {
    let isMounted = true;

    async function syncAndQueryPGlite() {
      try {
        const pglitePromise = getPGliteInstance();
        const timeoutPromise = new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error("PGlite WASM timeout")), 1500)
        );

        const pglite = (await Promise.race([pglitePromise, timeoutPromise])) as any;

        if (!pglite) return;

        if (initialProducts && initialProducts.length > 0) {
          for (const p of initialProducts) {
            if (p.brand) {
              await pglite.query(
                `INSERT INTO brands (id, name, domain, platform_type, sync_status, base_country, default_currency)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 ON CONFLICT (id) DO UPDATE SET name = $2, domain = $3, default_currency = $7`,
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
              `INSERT INTO products (id, brand_id, canonical_url, external_id, title, description, category, main_image)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
               ON CONFLICT (id) DO UPDATE SET title = $5, category = $7, main_image = $8, canonical_url = $3`,
              [
                p.id,
                p.brandId,
                p.canonicalUrl || "",
                p.externalId || "",
                p.title,
                p.description || "",
                p.category || "OTHER",
                p.mainImage || "",
              ]
            );

            if (p.variants && p.variants.length > 0) {
              for (const v of p.variants) {
                await pglite.query(
                  `INSERT INTO product_variants (id, product_id, size, color, sku, availability, raw_price, currency, normalized_price)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                   ON CONFLICT (id) DO UPDATE SET availability = $6, raw_price = $7, normalized_price = $9`,
                  [
                    v.id,
                    p.id,
                    v.size,
                    v.color,
                    v.sku || "",
                    v.availability,
                    v.rawPrice,
                    v.currency,
                    v.normalizedPrice,
                  ]
                );
              }
            }
          }
        }

        // Query PGlite in WASM memory
        const sqlParams: any[] = [];
        const conditions: string[] = [];

        if (selectedBrands.length > 0) {
          sqlParams.push(selectedBrands);
          conditions.push(`b.name = ANY($${sqlParams.length})`);
        }

        if (selectedCategories.length > 0) {
          sqlParams.push(selectedCategories);
          conditions.push(`p.category = ANY($${sqlParams.length})`);
        }

        if (maxPriceFilter && maxPriceFilter > 0) {
          sqlParams.push(maxPriceFilter);
          conditions.push(`pv.normalized_price <= $${sqlParams.length}`);
        }

        let whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

        let orderBy = "p.created_at DESC";
        if (sortBy === "price_asc") {
          orderBy = "pv.normalized_price ASC";
        } else if (sortBy === "price_desc") {
          orderBy = "pv.normalized_price DESC";
        }

        const result = await pglite.query(
          `SELECT 
            p.id, p.title, p.description, p.category, p.main_image as "mainImage", p.canonical_url as "canonicalUrl",
            b.id as "brandId", b.name as "brandName", b.domain as "brandDomain", b.default_currency as "brandDefaultCurrency",
            json_agg(json_build_object(
              'id', pv.id,
              'size', pv.size,
              'color', pv.color,
              'availability', pv.availability,
              'rawPrice', pv.raw_price,
              'currency', pv.currency,
              'normalizedPrice', pv.normalized_price
            )) as variants
          FROM products p
          JOIN brands b ON p.brand_id = b.id
          LEFT JOIN product_variants pv ON p.id = pv.product_id
          ${whereClause}
          GROUP BY p.id, b.id, b.name, b.domain, b.default_currency
          ORDER BY ${orderBy}`,
          sqlParams
        );

        if (isMounted && result && result.rows) {
          const mapped = result.rows.map((row: any) => ({
            id: row.id,
            title: row.title,
            description: row.description,
            category: row.category,
            mainImage: row.mainImage,
            canonicalUrl: row.canonicalUrl,
            brand: {
              id: row.brandId,
              name: row.brandName,
              domain: row.brandDomain,
              defaultCurrency: row.brandDefaultCurrency,
            },
            variants: row.variants || [],
          }));
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
    JSON.stringify(selectedBrands),
    JSON.stringify(selectedCategories),
    maxPriceFilter,
    sortBy,
  ]);

  let displayProducts = products;

  if (isFavoritesOnly) {
    displayProducts = displayProducts.filter((p) => favorites.includes(p.id));
  }

  displayProducts = filterProductsByGender(displayProducts, selectedGender);

  if (sortBy === "price_asc") {
    displayProducts.sort((a, b) => {
      const priceA = Number(a.variants?.[0]?.normalizedPrice || a.variants?.[0]?.rawPrice || 0);
      const priceB = Number(b.variants?.[0]?.normalizedPrice || b.variants?.[0]?.rawPrice || 0);
      return priceA - priceB;
    });
  } else if (sortBy === "price_desc") {
    displayProducts.sort((a, b) => {
      const priceA = Number(a.variants?.[0]?.normalizedPrice || a.variants?.[0]?.rawPrice || 0);
      const priceB = Number(b.variants?.[0]?.normalizedPrice || b.variants?.[0]?.rawPrice || 0);
      return priceB - priceA;
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
                product.variants.every((v: any) => v.availability === "OUT_OF_STOCK");

              const priceText = formatProductPrice(product);

              return (
                <a
                  key={product.id}
                  href={product.canonicalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
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
                          <Badge className="bg-background/90 text-foreground backdrop-blur-sm hover:bg-background text-[10px] sm:text-xs py-0.5 px-2 font-bold">
                            {product.brand?.name}
                          </Badge>
                          {isSoldOut && (
                            <Badge variant="destructive" className="text-[9px] font-black uppercase py-0.5 px-1.5">
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
                            {product.variants?.map((v: any) => (
                              <span
                                key={v.id}
                                className={`px-2.5 py-1 flex items-center justify-center rounded-md text-xs font-bold ${
                                  v.availability === "IN_STOCK"
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
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <h3 className="font-medium text-lg leading-tight group-hover:text-primary transition-colors flex items-center justify-between gap-2">
                          <span className="line-clamp-1">{product.title}</span>
                          <ExternalLink className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                        </h3>
                        <p className="text-muted-foreground font-semibold text-sm">
                          {priceText}
                        </p>
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
