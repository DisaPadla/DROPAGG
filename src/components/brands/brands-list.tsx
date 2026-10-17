"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ExternalLink,
  Trash2,
  PackageCheck,
  Globe,
  Loader2,
  RefreshCw,
  Radar,
  Compass,
  Plus,
  Check,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AddBrandModal } from "@/components/brands/add-brand-modal";
import { UserSwitcher } from "@/components/layout/user-switcher";
import { useLanguage } from "@/context/language-context";
import { appendUtmParams, trackOutboundClick } from "@/lib/utm";

export interface BrandItem {
  id: string;
  name: string;
  domain: string;
  platformType: string;
  syncStatus: string;
  baseCountry: string;
  defaultCurrency: string;
  isTracked?: boolean;
  _count: {
    products: number;
    userBrands?: number;
  };
}

interface BrandsListProps {
  initialBrands: BrandItem[];
  currentUser?: {
    id: string;
    name: string;
    email: string;
  };
}

export function BrandsList({ initialBrands, currentUser }: BrandsListProps) {
  const router = useRouter();
  const { lang, t } = useLanguage();
  const [brands, setBrands] = useState<BrandItem[]>(initialBrands);
  const [prevInitialBrands, setPrevInitialBrands] = useState<BrandItem[]>(initialBrands);
  const [activeTab, setActiveTab] = useState<"explore" | "radar">("explore");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  if (initialBrands !== prevInitialBrands) {
    setPrevInitialBrands(initialBrands);
    setBrands(initialBrands);
  }

  const handleToggleRadar = async (brand: BrandItem) => {
    setTogglingId(brand.id);
    const nextTracked = !brand.isTracked;

    try {
      const res = await fetch("/api/user-brands", {
        method: nextTracked ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: brand.id }),
      });

      if (res.ok) {
        setBrands((prev) =>
          prev.map((b) =>
            b.id === brand.id
              ? {
                  ...b,
                  isTracked: nextTracked,
                  _count: {
                    ...b._count,
                    userBrands: Math.max(
                      0,
                      (b._count.userBrands || 0) + (nextTracked ? 1 : -1)
                    ),
                  },
                }
              : b
          )
        );
        router.refresh();
      }
    } catch (e) {
      console.error("[BrandsList Toggle Radar Error]", e);
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirmId !== id) {
      setConfirmId(id);
      return;
    }

    setDeletingId(id);
    try {
      const targetBrand = brands.find((b) => b.id === id);
      const isOrphanHardDelete =
        activeTab === "explore" &&
        !targetBrand?.isTracked &&
        (targetBrand?._count?.userBrands || 0) === 0;

      const endpoint = isOrphanHardDelete
        ? `/api/brands/${id}?hard=true`
        : `/api/brands/${id}`;

      const res = await fetch(endpoint, { method: "DELETE" });
      if (res.ok) {
        const data = await res.json();
        if (data.hardDeleted) {
          setBrands((prev) => prev.filter((b) => b.id !== id));
        } else {
          // Safely removed from current user's personal Radar while preserving in Global Explore
          setBrands((prev) =>
            prev.map((b) =>
              b.id === id
                ? {
                    ...b,
                    isTracked: false,
                    _count: {
                      ...b._count,
                      userBrands: Math.max(0, (b._count.userBrands || 1) - 1),
                    },
                  }
                : b
            )
          );
        }
        router.refresh();
      } else {
        alert("Failed to remove brand");
      }
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
    
    setBrands((prev) =>
      prev.map((b) => (b.id === id ? { ...b, syncStatus: "SYNCING" } : b))
    );

    try {
      let page = 1;
      let totalSynced = 0;
      let hasMore = true;

      while (hasMore) {
        setSyncMessage(`${name}: ${t.syncingAll || "Синхронізація"} (Page ${page})...`);

        const res = await fetch(`/api/brands/${id}/sync-chunk`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ page, autoChain: true }),
        });

        if (!res.ok) {
          throw new Error(`Sync chunk failed with status ${res.status}`);
        }

        const data = await res.json();
        totalSynced += data.processedCount || 0;
        hasMore = Boolean(data.hasMore);
        page = data.nextPage || page + 1;

        setBrands((prev) =>
          prev.map((b) =>
            b.id === id
              ? {
                  ...b,
                  _count: {
                    ...b._count,
                    products: Math.max(b._count.products, totalSynced),
                  },
                }
              : b
          )
        );

        if (!hasMore) break;
      }

      setBrands((prev) =>
        prev.map((b) => (b.id === id ? { ...b, syncStatus: "ACTIVE" } : b))
      );

      setSyncMessage(`${name}: ${t.allStoresSynced || "Синхронізовано"}! (${totalSynced} items)`);
      setTimeout(() => setSyncMessage(null), 5000);
    } catch (e) {
      console.error("[BrandsList Sync Error]", e);
      fetch(`/api/brands/${id}/sync`, { method: "POST" }).catch(() => {});
      setSyncMessage(`${name}: ${t.syncTriggered}`);
      setTimeout(() => setSyncMessage(null), 5000);
    } finally {
      setSyncingId(null);
      setBrands((prev) =>
        prev.map((b) => (b.id === id ? { ...b, syncStatus: "ACTIVE" } : b))
      );
    }
  };

  const radarBrands = brands.filter((b) => b.isTracked);
  const displayedBrands = activeTab === "radar" ? radarBrands : brands;

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
          {currentUser && <UserSwitcher currentUser={currentUser} />}
          {/* Add Brand Trigger Modal */}
          <AddBrandModal />
        </div>
      </div>

      {/* Explore vs My Radar Filter Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="inline-flex items-center p-1 rounded-xl bg-muted/50 border border-border/80 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setActiveTab("explore")}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === "explore"
                ? "bg-background text-foreground shadow-sm border border-border/60"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Compass className={`w-4 h-4 ${activeTab === "explore" ? "text-primary" : "text-muted-foreground"}`} />
            <span>
              {lang === "uk" ? "Explore • Усі бренди" : "Explore • Global Directory"}
            </span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-muted text-foreground">
              {brands.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("radar")}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === "radar"
                ? "bg-background text-foreground shadow-sm border border-border/60"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Radar className={`w-4 h-4 ${activeTab === "radar" ? "text-emerald-500" : "text-muted-foreground"}`} />
            <span>
              {lang === "uk" ? "My Radar • Мої підписки" : "My Radar • Tracked Stores"}
            </span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                activeTab === "radar"
                  ? "bg-emerald-500/15 text-emerald-500"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {radarBrands.length}
            </span>
          </button>
        </div>

        <Link
          href={activeTab === "radar" ? "/?feed=radar" : "/"}
          className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
        >
          {activeTab === "radar"
            ? lang === "uk"
              ? "Переглянути стрічку мого радару →"
              : "Open My Radar Drop Feed →"
            : lang === "uk"
            ? "Переглянути глобальний каталог →"
            : "Open Global Explore Catalog →"}
        </Link>
      </div>

      {syncMessage && (
        <div className="p-3.5 rounded-xl bg-primary/10 border border-primary/20 text-xs font-semibold text-primary animate-in fade-in slide-in-from-top-1">
          {syncMessage}
        </div>
      )}

      {/* Brands Grid */}
      {displayedBrands.length === 0 ? (
        <div className="text-center py-20 bg-muted/20 rounded-2xl border border-dashed space-y-4">
          {activeTab === "radar" ? (
            <Radar className="w-12 h-12 text-emerald-500 mx-auto" />
          ) : (
            <Globe className="w-12 h-12 text-muted-foreground mx-auto" />
          )}
          <h3 className="text-lg font-bold">
            {activeTab === "radar"
              ? lang === "uk"
                ? "У вашому радарі ще немає магазинів"
                : "No stores in your Personal Radar yet"
              : t.noBrandsTitle}
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            {activeTab === "radar"
              ? lang === "uk"
                ? "Перейдіть на вкладку Explore, щоб підписатися на перевірені бренди в 1 клік, або додайте новий магазин за посиланням."
                : "Switch to the Explore tab to follow verified brands in 1 click, or add a new store URL."
              : t.noBrandsDesc}
          </p>
          <div className="pt-2 flex items-center justify-center gap-3">
            {activeTab === "radar" && brands.length > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setActiveTab("explore")}
                className="text-xs font-bold gap-1.5"
              >
                <Compass className="w-4 h-4" />
                {lang === "uk" ? "Обрати з Explore" : "Browse Explore Brands"}
              </Button>
            )}
            <AddBrandModal />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayedBrands.map((brand) => (
            <Card key={brand.id} className="relative group hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-xl font-bold">{brand.name}</CardTitle>
                    {brand.isTracked && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 text-[10px] font-bold border border-emerald-500/30">
                        <Radar className="w-2.5 h-2.5" />
                        {lang === "uk" ? "В Радарі" : "On Radar"}
                      </span>
                    )}
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
                  <Badge variant={syncingId === brand.id ? "secondary" : "default"}>
                    {syncingId === brand.id ? "SYNCING..." : brand.platformType}
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
                    {typeof brand._count.userBrands === "number" && (
                      <span
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                        title="Users tracking this brand"
                      >
                        <Users className="w-3.5 h-3.5" />
                        {brand._count.userBrands}
                      </span>
                    )}
                  </div>
                </div>

                {/* 1-Click Radar Subscription Toggle */}
                <Button
                  type="button"
                  variant={brand.isTracked ? "secondary" : "default"}
                  size="sm"
                  disabled={togglingId === brand.id}
                  onClick={() => handleToggleRadar(brand)}
                  className={`w-full text-xs font-bold gap-1.5 ${
                    brand.isTracked
                      ? "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/30"
                      : ""
                  }`}
                >
                  {togglingId === brand.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : brand.isTracked ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>
                        {lang === "uk" ? "У вашому Радарі (Відстежується)" : "Tracked on My Radar"}
                      </span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      <span>
                        {lang === "uk" ? "Додати в Мій Радар" : "Add to My Radar"}
                      </span>
                    </>
                  )}
                </Button>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <Link
                    href={
                      brand.isTracked && activeTab === "radar"
                        ? `/?feed=radar&brands=${encodeURIComponent(brand.name)}`
                        : `/?brands=${encodeURIComponent(brand.name)}`
                    }
                    className={buttonVariants({ variant: "outline", size: "sm", className: "flex-1 text-xs" })}
                  >
                    {t.viewProducts} ({brand._count.products})
                  </Link>

                  {/* Manual Chunked Sync Button */}
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

                  {/* Remove from Radar / Delete Button with 2-step confirmation */}
                  {(brand.isTracked || (brand._count.userBrands || 0) === 0) && (
                    <Button
                      variant={confirmId === brand.id ? "destructive" : "ghost"}
                      size="sm"
                      disabled={deletingId === brand.id}
                      onClick={() => handleDelete(brand.id)}
                      className="text-xs transition-colors shrink-0"
                      title={brand.isTracked ? "Remove from My Radar" : t.deleteStore}
                    >
                      {deletingId === brand.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : confirmId === brand.id ? (
                        t.confirmDelete
                      ) : (
                        <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive transition-colors" />
                      )}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
