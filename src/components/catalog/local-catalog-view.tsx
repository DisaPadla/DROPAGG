"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  saveLocalWorkspace,
  loadLocalWorkspace,
  LocalCatalogProduct,
  LocalCatalogVariant,
} from "@/lib/local-first-storage";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, RotateCcw } from "lucide-react";
import { formatProductPrice } from "@/lib/currency";
import { useLanguage } from "@/context/language-context";
import {
  appendUtmParams,
  getProductDiscountInfo,
  formatCompareAtPrice,
  trackOutboundClick,
} from "@/lib/utm";
import { getProductDropBadges } from "@/lib/drop-events";

interface LocalCatalogViewProps {
  userId: string;
  initialProducts: LocalCatalogProduct[];
  availableCategories: string[];
  availableBrands: string[];
}

const emptySubscribe = () => () => {};

export function LocalCatalogView({
  userId,
  initialProducts,
  availableCategories,
  availableBrands,
}: LocalCatalogViewProps) {
  const { t, currency } = useLanguage();
  void currency;
  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  useEffect(() => {
    if (initialProducts && initialProducts.length > 0) {
      // Save fresh server data to local browser storage
      saveLocalWorkspace(userId, {
        products: initialProducts,
        categories: availableCategories,
        brands: availableBrands,
      });
    }
  }, [userId, initialProducts, availableCategories, availableBrands]);

  let products: LocalCatalogProduct[] = initialProducts;
  let isLocalFallback = false;

  if ((!initialProducts || initialProducts.length === 0) && isClient) {
    const cached = loadLocalWorkspace(userId);
    if (cached && cached.products && cached.products.length > 0) {
      products = cached.products;
      isLocalFallback = true;
    }
  }

  return (
    <div>
      {isLocalFallback && (
        <div className="mb-4 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs font-semibold text-amber-500 flex items-center justify-between">
          <span>⚡ Local First Mode: Serving cached catalog data from device storage.</span>
        </div>
      )}

      {products.length === 0 ? (
        <div className="text-center py-16 bg-muted/20 rounded-2xl border border-dashed space-y-3">
          <p className="text-muted-foreground font-medium">No products found in your workspace.</p>
          <p className="text-xs text-muted-foreground">
            Click &quot;Add Brand&quot; in the top header to track a store and populate your catalog.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map((product: LocalCatalogProduct) => {
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
                    source: "local_catalog",
                  })
                }
                className="group block"
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
                      <div className="absolute top-3 left-3 flex flex-col gap-2">
                        <Badge className="bg-background/90 text-foreground backdrop-blur-sm hover:bg-background w-fit">
                          {product.brand?.name || "Brand"}
                        </Badge>
                        {dropBadges.isNewDrop && (
                          <Badge
                            data-badge="new-drop"
                            title={t.newDropTooltip || "New release (dropped within the last 48 hours)"}
                            className="bg-emerald-500/95 hover:bg-emerald-500 text-white border-0 shadow-sm backdrop-blur-sm text-[10px] font-black uppercase tracking-wider py-0.5 px-2 flex items-center gap-1 w-fit"
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
                            className="bg-amber-500/95 hover:bg-amber-500 text-black border-0 shadow-sm backdrop-blur-sm text-[10px] font-black uppercase tracking-wider py-0.5 px-2 flex items-center gap-1 w-fit"
                          >
                            <RotateCcw className="w-2.5 h-2.5" />
                            {t.restocked || "RESTOCKED"}
                          </Badge>
                        )}
                        {discountInfo.hasDiscount && discountInfo.discountPercent && (
                          <Badge className="bg-rose-600 text-white hover:bg-rose-600 text-xs py-0.5 px-2 font-black tracking-tight shadow-sm w-fit border-0">
                            -{discountInfo.discountPercent}%
                          </Badge>
                        )}
                      </div>

                      {/* Size availability overlay on hover */}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center pb-6">
                        <div className="flex flex-wrap gap-1.5 justify-center px-4">
                          {product.variants?.map((v: LocalCatalogVariant) => (
                            <span
                              key={v.id}
                              className={`px-2.5 py-1 flex items-center justify-center rounded-md text-xs font-bold ${
                                v.availability === "IN_STOCK"
                                  ? "bg-white text-black"
                                  : "bg-white/30 text-white/50 line-through"
                              }`}
                              title={v.availability === "IN_STOCK" ? "In Stock" : "Out of Stock"}
                            >
                              {v.size}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <h3 className="font-medium text-lg leading-tight">{product.title}</h3>
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
      )}
    </div>
  );
}
