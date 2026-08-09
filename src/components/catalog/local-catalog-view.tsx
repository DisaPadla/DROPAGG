"use client";

import { useEffect, useState } from "react";
import { saveLocalWorkspace, loadLocalWorkspace } from "@/lib/local-first-storage";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface LocalCatalogViewProps {
  userId: string;
  initialProducts: any[];
  availableCategories: string[];
  availableBrands: string[];
}

export function LocalCatalogView({
  userId,
  initialProducts,
  availableCategories,
  availableBrands,
}: LocalCatalogViewProps) {
  const [products, setProducts] = useState<any[]>(initialProducts);
  const [isLocalFallback, setIsLocalFallback] = useState(false);

  useEffect(() => {
    if (initialProducts && initialProducts.length > 0) {
      // Save fresh server data to local browser storage
      saveLocalWorkspace(userId, {
        products: initialProducts,
        categories: availableCategories,
        brands: availableBrands,
      });
      setProducts(initialProducts);
      setIsLocalFallback(false);
    } else {
      // Try loading from local storage fallback
      const cached = loadLocalWorkspace(userId);
      if (cached && cached.products && cached.products.length > 0) {
        setProducts(cached.products);
        setIsLocalFallback(true);
      }
    }
  }, [userId, initialProducts, availableCategories, availableBrands]);

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
            Click "Add Brand" in the top header to track a store and populate your catalog.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map((product: any) => (
            <div key={product.id} className="group">
              <Card className="overflow-hidden border-0 bg-transparent shadow-none">
                <CardContent className="p-0 relative">
                  <div className="aspect-[3/4] overflow-hidden rounded-xl bg-muted relative mb-4">
                    <img 
                      src={product.mainImage || "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&q=80&w=800"} 
                      alt={product.title} 
                      className="object-cover w-full h-full transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute top-3 left-3 flex flex-col gap-2">
                      <Badge className="bg-background/90 text-foreground backdrop-blur-sm hover:bg-background">
                        {product.brand?.name || "Brand"}
                      </Badge>
                    </div>
                    
                    {/* Size availability overlay on hover */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center pb-6">
                      <div className="flex flex-wrap gap-1.5 justify-center px-4">
                        {product.variants?.map((v: any) => (
                          <span 
                            key={v.id} 
                            className={`px-2.5 py-1 flex items-center justify-center rounded-md text-xs font-bold ${v.availability === 'IN_STOCK' ? 'bg-white text-black' : 'bg-white/30 text-white/50 line-through'}`}
                            title={v.availability === 'IN_STOCK' ? 'In Stock' : 'Out of Stock'}
                          >
                            {v.size}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-medium text-lg leading-tight">{product.title}</h3>
                    <p className="text-muted-foreground">
                      ${product.variants?.[0]?.normalizedPrice ? Number(product.variants[0].normalizedPrice) : (product.variants?.[0]?.rawPrice ? Number(product.variants[0].rawPrice) : 0)} USD
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
