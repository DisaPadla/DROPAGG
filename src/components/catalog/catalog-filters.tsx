"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Filter, RotateCcw, Heart, SlidersHorizontal, X, User } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { useLanguage } from "@/context/language-context";
import { translateCategory } from "@/lib/i18n";
import { getLocalFavorites } from "@/lib/favorites";

interface CatalogFiltersProps {
  availableCategories: string[];
  availableBrands: string[];
  maxPriceLimit?: number;
}

export function CatalogFilters({
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

    // Remove legacy single 'category' param if using multi 'categories'
    if (newParams.categories !== undefined) {
      params.delete("category");
    }

    router.push(`${pathname}?${params.toString()}`);
  };

  const setGender = (genderVal: string) => {
    updateFilters({ gender: genderVal === "all" ? null : genderVal });
  };

  const toggleFavoritesOnly = () => {
    updateFilters({ favorites: isFavoritesOnly ? null : "true" });
  };

  const toggleCategory = (cat: string) => {
    const next = selectedCategories.includes(cat)
      ? selectedCategories.filter((c) => c !== cat)
      : [...selectedCategories, cat];
    updateFilters({ categories: next.length > 0 ? next.join(",") : null });
  };

  const toggleBrand = (brand: string) => {
    const next = selectedBrands.includes(brand)
      ? selectedBrands.filter((b) => b !== brand)
      : [...selectedBrands, brand];
    updateFilters({ brands: next.length > 0 ? next.join(",") : null });
  };

  const handlePriceChange = (val: number | readonly number[]) => {
    const newMax = Array.isArray(val) ? val[0] : (val as number);
    setPrice(newMax);
  };

  const handlePriceCommit = () => {
    updateFilters({ maxPrice: price < maxPriceLimit ? price.toString() : null });
  };

  const clearAll = () => {
    router.push(pathname);
  };

  const activeCount =
    (selectedGender !== "all" ? 1 : 0) +
    (isFavoritesOnly ? 1 : 0) +
    selectedCategories.length +
    selectedBrands.length +
    (currentMaxPrice < maxPriceLimit ? 1 : 0);

  const hasActiveFilters = activeCount > 0;

  const filterContent = (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b pb-4">
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5" />
          <h2 className="text-xl font-bold tracking-tight">{t.filters}</h2>
        </div>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAll}
            className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 h-8 px-2"
          >
            <RotateCcw className="w-3 h-3" />
            {t.resetFilters}
          </Button>
        )}
      </div>

      {/* Special Favorites Filter Toggle */}
      <div
        onClick={toggleFavoritesOnly}
        className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
          isFavoritesOnly
            ? "bg-red-500/10 border-red-500/30 text-red-500 font-bold shadow-sm"
            : "bg-muted/30 hover:bg-muted text-foreground border-border"
        }`}
      >
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Heart className={`w-4 h-4 ${isFavoritesOnly ? "fill-red-500 text-red-500" : "text-muted-foreground"}`} />
          <span>{t.favoritesOnly}</span>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${isFavoritesOnly ? "bg-red-500 text-white" : "bg-muted text-muted-foreground"}`}>
          {favCount}
        </span>
      </div>

      {/* Gender Filter Segmented Selector */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <User className="w-4 h-4 text-muted-foreground" />
          <span>{t.gender}</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-muted/40 border">
          {[
            { id: "all", label: t.allGenders },
            { id: "men", label: t.menGender },
            { id: "women", label: t.womenGender },
            { id: "unisex", label: t.unisexGender },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setGender(item.id)}
              className={`py-1.5 text-xs font-semibold rounded-lg transition-all ${
                selectedGender === item.id
                  ? "bg-background text-foreground font-bold shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Clothing Type / Category Filter */}
      <div className="space-y-4 pt-2">
        <h3 className="font-semibold text-sm">{t.category}</h3>
        <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
          {availableCategories.map((category) => {
            const isChecked = selectedCategories.includes(category);
            const label = translateCategory(category, lang);

            return (
              <div
                key={category}
                className="flex items-center space-x-2 cursor-pointer"
                onClick={() => toggleCategory(category)}
              >
                <Checkbox
                  id={`cat-${category}`}
                  checked={isChecked}
                  onCheckedChange={() => toggleCategory(category)}
                />
                <label
                  htmlFor={`cat-${category}`}
                  className="text-sm font-medium leading-none cursor-pointer select-none"
                >
                  {label}
                </label>
              </div>
            );
          })}
        </div>
      </div>

      {/* Brand Filter */}
      <div className="space-y-4">
        <h3 className="font-semibold text-sm">{t.brand}</h3>
        <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
          {availableBrands.map((brand) => {
            const isChecked = selectedBrands.includes(brand);
            return (
              <div
                key={brand}
                className="flex items-center space-x-2 cursor-pointer"
                onClick={() => toggleBrand(brand)}
              >
                <Checkbox
                  id={`brand-${brand}`}
                  checked={isChecked}
                  onCheckedChange={() => toggleBrand(brand)}
                />
                <label
                  htmlFor={`brand-${brand}`}
                  className="text-sm font-medium leading-none cursor-pointer select-none"
                >
                  {brand}
                </label>
              </div>
            );
          })}
        </div>
      </div>

      {/* Price Filter */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="font-semibold text-sm">{t.maxPrice}</h3>
          <span className="text-xs font-bold font-mono">${price} USD</span>
        </div>
        <Slider
          value={[price]}
          onValueChange={handlePriceChange}
          onValueCommitted={handlePriceCommit}
          min={10}
          max={maxPriceLimit}
          step={10}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-muted-foreground pt-1">
          <span>$10</span>
          <span>${maxPriceLimit}+</span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Filter Trigger Button */}
      <div className="block md:hidden mb-4">
        <button
          type="button"
          onClick={() => setMobileFiltersOpen(true)}
          className="w-full h-11 px-4 rounded-xl border bg-background text-sm font-semibold flex items-center justify-between shadow-sm active:scale-[0.99] transition-transform"
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
