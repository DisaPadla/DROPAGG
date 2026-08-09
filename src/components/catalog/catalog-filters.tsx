"use client";

import { Suspense, useState, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Filter, RotateCcw, Heart, SlidersHorizontal, X, User } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/language-context";
import { translateCategory } from "@/lib/i18n";
import { getLocalFavorites } from "@/lib/favorites";

interface CatalogFiltersProps {
  availableCategories: string[];
  availableBrands: string[];
  maxPriceLimit?: number;
}

function CatalogFiltersContent({
  availableCategories,
  availableBrands,
  maxPriceLimit = 1000,
}: CatalogFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { lang, t } = useLanguage();
  const [favCount, setFavCount] = useState(0);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  useEffect(() => {
    const updateFavCount = () => {
      setFavCount(getLocalFavorites().length);
    };
    updateFavCount();

    window.addEventListener("dropagg_favorites_change", updateFavCount);
    return () => window.removeEventListener("dropagg_favorites_change", updateFavCount);
  }, []);

  // Parse current state from URL searchParams
  const selectedGender = searchParams.get("gender") || "all";
  const isFavoritesOnly = searchParams.get("favorites") === "true";
  const selectedCategories = searchParams.get("categories")
    ? searchParams.get("categories")!.split(",")
    : searchParams.get("category")
    ? [searchParams.get("category")!]
    : [];
  const selectedBrands = searchParams.get("brands") ? searchParams.get("brands")!.split(",") : [];
  const currentMaxPrice = searchParams.get("maxPrice") ? Number(searchParams.get("maxPrice")) : maxPriceLimit;

  const [price, setPrice] = useState<number>(currentMaxPrice);

  useEffect(() => {
    setPrice(currentMaxPrice);
  }, [currentMaxPrice]);

  const updateFilters = (newParams: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    
    Object.entries(newParams).forEach(([key, value]) => {
      if (value === null || value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });

    if (newParams.categories !== undefined) {
      params.delete("category");
    }

    router.push(`${pathname}?${params.toString()}`);
  };

  const handleGenderChange = (gender: string) => {
    updateFilters({ gender: gender === "all" ? null : gender });
  };

  const handleFavoritesToggle = () => {
    updateFilters({ favorites: isFavoritesOnly ? null : "true" });
  };

  const handleCategoryToggle = (category: string) => {
    let updated: string[];
    if (selectedCategories.includes(category)) {
      updated = selectedCategories.filter((c) => c !== category);
    } else {
      updated = [...selectedCategories, category];
    }
    updateFilters({
      categories: updated.length > 0 ? updated.join(",") : null,
    });
  };

  const handleBrandToggle = (brand: string) => {
    let updated: string[];
    if (selectedBrands.includes(brand)) {
      updated = selectedBrands.filter((b) => b !== brand);
    } else {
      updated = [...selectedBrands, brand];
    }
    updateFilters({
      brands: updated.length > 0 ? updated.join(",") : null,
    });
  };

  const handlePriceCommit = (val: number) => {
    updateFilters({
      maxPrice: val < maxPriceLimit ? val.toString() : null,
    });
  };

  const clearAllFilters = () => {
    setPrice(maxPriceLimit);
    router.push(pathname);
  };

  const activeCount =
    (selectedGender !== "all" ? 1 : 0) +
    (isFavoritesOnly ? 1 : 0) +
    selectedCategories.length +
    selectedBrands.length +
    (currentMaxPrice < maxPriceLimit ? 1 : 0);

  const filterContent = (
    <div className="space-y-6">
      {/* Header & Reset button */}
      <div className="flex items-center justify-between border-b pb-3">
        <div className="flex items-center gap-2 font-bold text-lg">
          <Filter className="w-5 h-5" />
          <span>{t.filters}</span>
          {activeCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-xs font-bold">
              {activeCount}
            </span>
          )}
        </div>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={clearAllFilters}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors font-medium"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t.clearAll}</span>
          </button>
        )}
      </div>

      {/* Gender Filter Segmented Control */}
      <div className="space-y-3">
        <h3 className="font-semibold text-xs text-muted-foreground tracking-wider uppercase flex items-center gap-1.5">
          <User className="w-3.5 h-3.5" />
          <span>{t.gender}</span>
        </h3>
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-muted/40 rounded-xl border">
          <button
            type="button"
            onClick={() => handleGenderChange("all")}
            className={`py-1.5 text-xs font-bold rounded-lg transition-all ${
              selectedGender === "all"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => handleGenderChange("men")}
            className={`py-1.5 text-xs font-bold rounded-lg transition-all ${
              selectedGender === "men"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.menGender}
          </button>
          <button
            type="button"
            onClick={() => handleGenderChange("women")}
            className={`py-1.5 text-xs font-bold rounded-lg transition-all ${
              selectedGender === "women"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.womenGender}
          </button>
        </div>
      </div>

      {/* Favorites Only Quick Toggle */}
      <div className="space-y-3 pt-2 border-t">
        <button
          type="button"
          onClick={handleFavoritesToggle}
          className={`w-full flex items-center justify-between p-3 rounded-xl border text-xs font-semibold transition-all ${
            isFavoritesOnly
              ? "bg-red-500/10 border-red-500/30 text-red-500 font-bold"
              : "bg-muted/20 hover:bg-muted/40 border-border text-foreground"
          }`}
        >
          <div className="flex items-center gap-2">
            <Heart className={`w-4 h-4 ${isFavoritesOnly ? "fill-red-500 text-red-500" : "text-muted-foreground"}`} />
            <span>{t.favoritesOnly}</span>
          </div>
          {favCount > 0 && (
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${isFavoritesOnly ? "bg-red-500 text-white" : "bg-muted text-muted-foreground"}`}>
              {favCount}
            </span>
          )}
        </button>
      </div>

      {/* Category Section */}
      <div className="space-y-3 pt-2 border-t">
        <h3 className="font-semibold text-xs text-muted-foreground tracking-wider uppercase">
          {t.categories}
        </h3>
        <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1 scrollbar-thin">
          {availableCategories.map((category) => {
            const isChecked = selectedCategories.includes(category);
            return (
              <label
                key={category}
                className="flex items-center space-x-2.5 text-sm cursor-pointer hover:text-primary transition-colors group"
              >
                <Checkbox
                  checked={isChecked}
                  onCheckedChange={() => handleCategoryToggle(category)}
                  className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                />
                <span className={`font-medium ${isChecked ? "text-foreground font-bold" : "text-muted-foreground"}`}>
                  {translateCategory(category, lang)}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Brand Section */}
      <div className="space-y-3 pt-2 border-t">
        <h3 className="font-semibold text-xs text-muted-foreground tracking-wider uppercase">
          {t.brands}
        </h3>
        <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1 scrollbar-thin">
          {availableBrands.map((brand) => {
            const isChecked = selectedBrands.includes(brand);
            return (
              <label
                key={brand}
                className="flex items-center space-x-2.5 text-sm cursor-pointer hover:text-primary transition-colors group"
              >
                <Checkbox
                  checked={isChecked}
                  onCheckedChange={() => handleBrandToggle(brand)}
                  className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                />
                <span className={`font-medium ${isChecked ? "text-foreground font-bold" : "text-muted-foreground"}`}>
                  {brand}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Price Range Slider Section */}
      <div className="space-y-4 pt-2 border-t">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-xs text-muted-foreground tracking-wider uppercase">
            {t.maxPrice}
          </h3>
          <span className="text-xs font-bold bg-muted px-2 py-0.5 rounded">
            ${price} USD
          </span>
        </div>
        <Slider
          value={[price]}
          min={10}
          max={maxPriceLimit}
          step={10}
          onValueChange={(vals: any) => {
            const val = Array.isArray(vals) ? vals[0] : vals;
            setPrice(val);
          }}
          onValueCommitted={(vals: any) => {
            const val = Array.isArray(vals) ? vals[0] : vals;
            handlePriceCommit(val);
          }}
          className="py-1"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
          <span>$10</span>
          <span>${maxPriceLimit}</span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Filter Toggle Drawer Button */}
      <div className="md:hidden mb-4">
        <button
          type="button"
          onClick={() => setMobileFiltersOpen(true)}
          className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/60 border rounded-xl font-bold text-sm transition-colors"
        >
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-primary" />
            <span>{t.filters}</span>
          </div>
          {activeCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-xs font-bold">
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {/* Mobile Filter Modal Sheet */}
      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-md md:hidden p-4 overflow-y-auto animate-in slide-in-from-bottom duration-200">
          <div className="flex justify-between items-center pb-4 border-b">
            <h2 className="text-xl font-bold">{t.filters}</h2>
            <button
              type="button"
              onClick={() => setMobileFiltersOpen(false)}
              className="p-2 rounded-full hover:bg-muted text-muted-foreground"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          <div className="pt-4 flex-1">
            {filterContent}
          </div>
          <div className="pt-6 border-t mt-auto">
            <Button
              className="w-full font-bold h-11 text-sm rounded-xl"
              onClick={() => setMobileFiltersOpen(false)}
            >
              Show Results
            </Button>
          </div>
        </div>
      )}

      {/* Desktop Sticky Sidebar */}
      <aside className="hidden md:block w-64 shrink-0">
        <div className="sticky top-24 bg-background p-4 rounded-xl border shadow-sm max-h-[calc(100vh-7rem)] overflow-y-auto pr-2 scrollbar-thin">
          {filterContent}
        </div>
      </aside>
    </>
  );
}

export function CatalogFilters(props: CatalogFiltersProps) {
  return (
    <Suspense fallback={<div className="w-full md:w-64 h-96 bg-muted/40 animate-pulse rounded-xl" />}>
      <CatalogFiltersContent {...props} />
    </Suspense>
  );
}
