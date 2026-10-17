"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Compass, Radar, Plus, Check, Loader2, Sparkles, ArrowRight } from "lucide-react";
import { useLanguage } from "@/context/language-context";
import { UserSwitcher } from "@/components/layout/user-switcher";
import { AddBrandModal } from "@/components/brands/add-brand-modal";
import { Button } from "@/components/ui/button";

export interface GlobalBrandSummary {
  id: string;
  name: string;
  domain: string;
  productsCount?: number;
  isTracked?: boolean;
}

interface FeedTabsProps {
  activeFeed: "explore" | "radar";
  totalGlobalBrands: number;
  radarBrandsCount: number;
  currentUser?: {
    id: string;
    name: string;
    email: string;
  };
}

export function FeedTabs({
  activeFeed,
  totalGlobalBrands,
  radarBrandsCount,
  currentUser,
}: FeedTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { lang, t } = useLanguage();

  const switchFeed = (targetFeed: "explore" | "radar") => {
    const params = new URLSearchParams(searchParams.toString());
    if (targetFeed === "explore") {
      params.delete("feed");
    } else {
      params.set("feed", "radar");
    }
    // Reset brand filter if switching feeds so user doesn't get stuck on a filtered-out brand
    params.delete("brands");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const exploreLabel =
    t.feedExplore || (lang === "uk" ? "Explore • Глобальний каталог" : "Explore • Global Catalog");
  const radarLabel =
    t.feedRadar || (lang === "uk" ? "My Radar • Моя стрічка" : "My Radar • Personal Feed");

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-6 border-b">
      <div className="inline-flex items-center p-1 rounded-xl bg-muted/50 border border-border/80 w-full sm:w-auto">
        <button
          type="button"
          onClick={() => switchFeed("explore")}
          className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
            activeFeed === "explore"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Compass className={`w-4 h-4 ${activeFeed === "explore" ? "text-primary" : "text-muted-foreground"}`} />
          <span>{exploreLabel}</span>
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${
              activeFeed === "explore"
                ? "bg-primary/15 text-primary"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {totalGlobalBrands}
          </span>
        </button>

        <button
          type="button"
          onClick={() => switchFeed("radar")}
          className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
            activeFeed === "radar"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Radar className={`w-4 h-4 ${activeFeed === "radar" ? "text-emerald-500 animate-pulse" : "text-muted-foreground"}`} />
          <span>{radarLabel}</span>
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${
              activeFeed === "radar"
                ? "bg-emerald-500/15 text-emerald-500"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {radarBrandsCount}
          </span>
        </button>
      </div>

      {currentUser && (
        <div className="flex items-center justify-between sm:justify-end gap-2">
          <span className="text-[11px] text-muted-foreground hidden lg:inline">
            {lang === "uk" ? "Профіль радару:" : "Radar Workspace:"}
          </span>
          <UserSwitcher currentUser={currentUser} />
        </div>
      )}
    </div>
  );
}

interface EmptyRadarStateProps {
  globalBrands: GlobalBrandSummary[];
}

export function EmptyRadarState({ globalBrands }: EmptyRadarStateProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { lang, t } = useLanguage();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [trackedIds, setTrackedIds] = useState<string[]>([]);

  const handleFollowBrand = async (brandId: string) => {
    setLoadingId(brandId);
    try {
      const res = await fetch("/api/user-brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId }),
      });
      if (res.ok) {
        setTrackedIds((prev) => [...prev, brandId]);
        router.refresh();
      }
    } catch (e) {
      console.error("Failed to follow brand:", e);
    } finally {
      setLoadingId(null);
    }
  };

  const goToExplore = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("feed");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <div className="rounded-2xl border border-dashed bg-muted/15 p-8 sm:p-12 text-center space-y-6 my-4">
      <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center mx-auto">
        <Radar className="w-6 h-6" />
      </div>

      <div className="space-y-2 max-w-lg mx-auto">
        <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">
          {t.emptyRadarTitle ||
            (lang === "uk"
              ? "Ваш персональний радар порожній"
              : "Your Personal Radar is Empty")}
        </h2>
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
          {t.emptyRadarDesc ||
            (lang === "uk"
              ? "Підпишіться на перевірені бренди з глобального каталогу Explore в 1 клік або додайте власне посилання на магазин, щоб сформувати персональну стрічку дропів."
              : "Follow verified brands from the global Explore catalog in one click, or add a store URL to build your personal drop feed.")}
        </p>
      </div>

      {globalBrands.length > 0 && (
        <div className="max-w-2xl mx-auto space-y-3 pt-2">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span>
              {lang === "uk"
                ? "Доступні бренди в глобальному каталозі:"
                : "Available brands in Global Catalog:"}
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            {globalBrands.map((b) => {
              const isAdded = trackedIds.includes(b.id);
              const isLoading = loadingId === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  disabled={isLoading || isAdded}
                  onClick={() => handleFollowBrand(b.id)}
                  className={`px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all ${
                    isAdded
                      ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-500"
                      : "bg-background hover:bg-muted border-border text-foreground shadow-xs"
                  }`}
                >
                  {isLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                  ) : isAdded ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Plus className="w-3.5 h-3.5 text-primary" />
                  )}
                  <span>{b.name}</span>
                  {typeof b.productsCount === "number" && (
                    <span className="text-[10px] text-muted-foreground font-normal">
                      ({b.productsCount})
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={goToExplore}
          className="text-xs font-bold gap-1.5"
        >
          <Compass className="w-4 h-4" />
          <span>
            {lang === "uk" ? "Перейти в Explore (Усі дропи)" : "Browse Explore (All Drops)"}
          </span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Button>

        <AddBrandModal />
      </div>
    </div>
  );
}
