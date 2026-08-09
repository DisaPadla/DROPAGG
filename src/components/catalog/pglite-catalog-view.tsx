"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getPGliteInstance } from "@/lib/pglite-client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Heart } from "lucide-react";
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

export function PGliteCatalogView({
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
                p.category || "",
                p.mainImage || "",
              ]
            );

            if (p.variants && p.variants.length > 0) {
              for (const v of p.variants) {
                await pglite.query(
                  `INSERT INTO product_variants (id, product_id, size, color, sku, availability, raw_price, currency, normalized_price)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                   ON CONFLICT (id) DO UPDATE SET availability = $6, raw_price = $7, currency = $8`,
                  [
                    v.id,
                    v.productId,
                    v.size || "",
                    v.color || "",
                    v.sku || "",
                    v.availability || "OUT_OF_STOCK",
                    v.rawPrice ? Number(v.rawPrice) : 0,
                    v.currency || "",
                    v.normalizedPrice ? Number(v.normalizedPrice) : 0,
                  ]
                );
              }
            }
          }
        }

        let sql = `
          SELECT p.*, b.name as brand_name, b.domain as brand_domain, b.default_currency as brand_default_currency
          FROM products p
          JOIN brands b ON p.brand_id = b.id
          WHERE 1=1
        `;

        const queryParams: any[] = [];

        if (selectedBrands.length > 0) {
          queryParams.push(selectedBrands);
          sql += ` AND b.name = ANY($${queryParams.length})`;
        }

        if (selectedCategories.length > 0) {
          queryParams.push(selectedCategories);
          sql += ` AND p.category = ANY($${queryParams.length})`;
        }

        if (sortBy === "newest_stores") {
          sql += ` ORDER BY b.created_at DESC, p.created_at DESC`;
        } else {
          sql += ` ORDER BY p.created_at DESC`;
        }

        const res = await pglite.query(sql, queryParams);

        if (res && res.rows && isMounted) {
          const resProducts = await Promise.all(
            res.rows.map(async (row: any) => {
              const vRes = await pglite.query(
                `SELECT * FROM product_variants WHERE product_id = $1`,
                [row.id]
              );
              return {
                id: row.id,
                title: row.title,
                mainImage: row.main_image,
                category: row.category,
                description: row.description,
                canonicalUrl: row.canonical_url,
                brand: {
                  name: row.brand_name,
                  domain: row.brand_domain,
                  defaultCurrency: row.brand_default_currency,
                },
                variants: vRes.rows.map((vr: any) => ({
                  id: vr.id,
                  size: vr.size,
                  availability: vr.availability,
                  rawPrice: vr.raw_price,
                  currency: vr.currency,
                  normalizedPrice: vr.normalized_price,
                })),
              };
            })
          );

          if (resProducts.length > 0) {
            if (sortBy === "price_asc") {
              resProducts.sort((a: any, b: any) => {
                const pA = Number(a.variants?.[0]?.normalizedPrice || a.variants?.[0]?.rawPrice || 0);
                const pB = Number(b.variants?.[0]?.normalizedPrice || b.variants?.[0]?.rawPrice || 0);
                return pA - pB;
              });
            } else if (sortBy === "price_desc") {
              resProducts.sort((a: any, b: any) => {
                const pA = Number(a.variants?.[0]?.normalizedPrice || a.variants?.[0]?.rawPrice || 0);
                const pB = Number(b.variants?.[0]?.normalizedPrice || b.variants?.[0]?.rawPrice || 0);
                return pB - pA;
              });
            }
            setProducts(resProducts);
          }
        }
      } catch (e) {
        console.warn("[PGlite WASM Sync/Query Fallback]", e);
      }
    }

    syncAndQueryPGlite();

    return () => {
      isMounted = false;
    };
  }, [userId, initialProducts, selectedBrands, selectedCategories, maxPriceFilter, sortBy, selectedGender]);

  // Filter products by Favorites if isFavoritesOnly filter is active
  let displayedProducts = isFavoritesOnly
    ? products.filter((p) => favorites.includes(p.id))
    : products;

  // Apply strict gender filtering
  displayedProducts = filterProductsByGender(displayedProducts, selectedGender);

  return (
    <div>
      {displayedProducts.length === 0 ? (
        <div className="text-center py-16 bg-muted/20 rounded-2xl border border-dashed space-y-3 px-4">
          <p className="text-muted-foreground font-medium">
            {isFavoritesOnly ? t.noFavorites : t.noProducts}
          </p>
          {!isFavoritesOnly && (
            <p className="text-xs text-muted-foreground">{t.addBrandPrompt}</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-6">
          {displayedProducts.map((product: any) => {
            const productUrl =
              product.canonicalUrl ||
              (product.brand?.domain ? `https://${product.brand.domain}` : "#");

            const isFav = favorites.includes(product.id);
            const firstVariant = product.variants?.[0];
            const priceText = formatProductPrice(
              firstVariant?.rawPrice || firstVariant?.normalizedPrice,
              firstVariant?.currency,
              product.brand?.defaultCurrency
            );

            // Determine if all sizes/variants are out of stock (Sold Out)
            const isSoldOut =
              !product.variants ||
              product.variants.length === 0 ||
              product.variants.every((v: any) => v.availability === "OUT_OF_STOCK");

            return (
              <a
                key={product.id}
                href={productUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`group block cursor-pointer transition-all ${
                  isSoldOut ? "opacity-60 grayscale-[0.3] hover:opacity-90 hover:grayscale-0" : ""
                }`}
              >
                <Card className="overflow-hidden border-0 bg-transparent shadow-none">
                  <CardContent className="p-0 relative">
                    <div className="aspect-[3/4] overflow-hidden rounded-xl bg-muted relative mb-4">
                      <img
                        src={
                          product.mainImage ||
                          "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&q=80&w=800"
                        }
                        alt={product.title}
                        className="object-cover w-full h-full transition-transform duration-500 group-hover:scale-105"
                      />
                      <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 z-10">
                        <Badge className="bg-background/90 text-foreground backdrop-blur-sm hover:bg-background">
                          {product.brand?.name || "Brand"}
                        </Badge>
                        {isSoldOut && (
                          <Badge className="bg-destructive text-destructive-foreground font-bold shadow-sm">
                            {t.soldOut}
                          </Badge>
                        )}
                      </div>

                      {/* Heart Favorite Toggle Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          toggleFavorite(product.id);
                        }}
                        className="absolute top-3 right-3 z-10 p-2 rounded-full bg-background/80 backdrop-blur-sm hover:bg-background transition-all shadow-sm hover:scale-110 active:scale-95"
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

                      {/* Size availability overlay on hover */}
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
      )}
    </div>
  );
}
