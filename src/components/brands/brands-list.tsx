"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  ExternalLink,
  Trash2,
  PackageCheck,
  Globe,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AddBrandModal } from "@/components/brands/add-brand-modal";
import { useLanguage } from "@/context/language-context";
import { appendUtmParams, trackOutboundClick } from "@/lib/utm";
import { useLocalCatalog } from "@/lib/local-db";

export interface BrandItem {
  id: string;
  name: string;
  domain: string;
  platformType: string;
  syncStatus: string;
  baseCountry: string;
  defaultCurrency: string;
  _count: {
    products: number;
  };
}

export function BrandsList() {
  const { t } = useLanguage();
  const {
    hydrated,
    brands: localBrands,
    products: localProducts,
    syncLocalBrandById,
    deleteLocalBrand,
  } = useLocalCatalog();

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const brands: BrandItem[] = useMemo(() => {
    const productCounts = new Map<string, number>();
    for (const p of localProducts) {
      const bId = p.brandId || p.brand?.id || "";
      if (bId) {
        productCounts.set(bId, (productCounts.get(bId) || 0) + 1);
      }
    }

    return localBrands.map((b) => ({
      id: b.id,
      name: b.name,
      domain: b.domain,
      platformType: b.platformType,
      syncStatus: b.syncStatus,
      baseCountry: b.baseCountry,
      defaultCurrency: b.defaultCurrency,
      _count: {
        products: productCounts.get(b.id) || 0,
      },
    }));
  }, [localBrands, localProducts]);

  const handleDelete = async (id: string) => {
    if (confirmId !== id) {
      setConfirmId(id);
      return;
    }

    setDeletingId(id);
    try {
      await deleteLocalBrand(id);
    } catch (e) {
      console.error(e);
      alert("An error occurred while removing the brand.");
    } finally {
      setDeletingId(null);
      setConfirmId(null);
    }
  };

  const handleSync = async (id: string, name: string) => {
    setSyncingId(id);
    setSyncMessage(null);

    try {
      const totalSynced = await syncLocalBrandById(id, (page) => {
        setSyncMessage(`${name}: ${t.syncingAll || "Синхронізація"} (Page ${page})...`);
      });

      setSyncMessage(`${name}: ${t.allStoresSynced || "Синхронізовано"}! (${totalSynced} items)`);
      setTimeout(() => setSyncMessage(null), 5000);
    } catch (e) {
      console.error("[BrandsList Sync Error]", e);
      setSyncMessage(`${name}: ${t.syncTriggered}`);
      setTimeout(() => setSyncMessage(null), 5000);
    } finally {
      setSyncingId(null);
    }
  };

  if (!hydrated) {
    return (
      <div className="space-y-8">
        <div className="h-20 bg-muted/30 animate-pulse rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 bg-muted/30 animate-pulse rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">{t.trackedBrandsTitle}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {t.trackedBrandsDesc}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <AddBrandModal />
        </div>
      </div>

      {syncMessage && (
        <div className="p-3.5 rounded-xl bg-primary/10 border border-primary/20 text-xs font-semibold text-primary animate-in fade-in slide-in-from-top-1">
          {syncMessage}
        </div>
      )}

      {/* Brands Grid */}
      {brands.length === 0 ? (
        <div className="text-center py-20 bg-muted/20 rounded-2xl border border-dashed space-y-4">
          <Globe className="w-12 h-12 text-muted-foreground mx-auto" />
          <h3 className="text-lg font-bold">{t.noBrandsTitle}</h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            {t.noBrandsDesc}
          </p>
          <div className="pt-2 flex items-center justify-center gap-3">
            <AddBrandModal />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {brands.map((brand) => (
            <Card key={brand.id} className="relative group hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-xl font-bold">{brand.name}</CardTitle>
                  </div>
                  <CardDescription className="flex items-center gap-1.5 text-xs">
                    <a
                      href={appendUtmParams(`https://${brand.domain}`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() =>
                        trackOutboundClick({
                          brandId: brand.id,
                          brandName: brand.name,
                          targetUrl: appendUtmParams(`https://${brand.domain}`),
                          source: "brands_list",
                        })
                      }
                      className="hover:underline flex items-center gap-1 text-muted-foreground hover:text-foreground"
                    >
                      {brand.domain}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </CardDescription>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge variant="outline" className="text-[10px] font-semibold px-1.5 py-0.5 text-muted-foreground">
                    {brand.baseCountry || "US"} • {brand.defaultCurrency || "USD"}
                  </Badge>
                  <Badge variant={syncingId === brand.id || brand.syncStatus === "SYNCING" ? "secondary" : "default"}>
                    {syncingId === brand.id || brand.syncStatus === "SYNCING" ? "SYNCING..." : brand.platformType}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-4 pt-4">
                <div className="flex items-center justify-between text-sm py-2 px-3 rounded-lg bg-muted/40 border">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <PackageCheck className="w-4 h-4 text-primary" />
                    <span>Catalog Items:</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-foreground">{brand._count.products} products</span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <Link
                    href={`/?brands=${encodeURIComponent(brand.name)}`}
                    className={buttonVariants({ variant: "outline", size: "sm", className: "flex-1 text-xs" })}
                  >
                    {t.viewProducts} ({brand._count.products})
                  </Link>

                  {/* Manual Local Sync Button */}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={syncingId === brand.id}
                    onClick={() => handleSync(brand.id, brand.name)}
                    className="text-xs shrink-0 gap-1.5"
                    title={t.syncStore}
                  >
                    {syncingId === brand.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5 text-primary" />
                    )}
                    <span className="hidden sm:inline">{t.syncStore}</span>
                  </Button>

                  {/* Delete from Device Button with 2-step confirmation */}
                  <Button
                    variant={confirmId === brand.id ? "destructive" : "ghost"}
                    size="sm"
                    disabled={deletingId === brand.id}
                    onClick={() => handleDelete(brand.id)}
                    className="text-xs transition-colors shrink-0"
                    title={t.deleteStore}
                  >
                    {deletingId === brand.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : confirmId === brand.id ? (
                      t.confirmDelete
                    ) : (
                      <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive transition-colors" />
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
