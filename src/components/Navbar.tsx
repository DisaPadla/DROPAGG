"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { SyncAllButton } from "./layout/sync-all-button";
import { AddBrandModal } from "./brands/add-brand-modal";
import { LanguageSwitcher } from "./layout/language-switcher";
import { useLanguage } from "@/context/language-context";
import { getLocalFavorites } from "@/lib/favorites";
import { Store, LayoutGrid, Heart, Menu, X } from "lucide-react";
import { Logo } from "@/components/ui/logo";

function NavbarContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { t } = useLanguage();
  const [favCount, setFavCount] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const updateFavCount = () => {
      setFavCount(getLocalFavorites().length);
    };
    updateFavCount();

    window.addEventListener("dropagg_favorites_change", updateFavCount);
    return () => window.removeEventListener("dropagg_favorites_change", updateFavCount);
  }, []);

  const isFavoritesOnly = searchParams.get("favorites") === "true";

  const toggleFavorites = () => {
    const params = new URLSearchParams(searchParams.toString());
    if (isFavoritesOnly) {
      params.delete("favorites");
    } else {
      params.set("favorites", "true");
    }
    router.push(`/?${params.toString()}`);
    setMobileMenuOpen(false);
  };

  return (
    <nav className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        
        {/* Brand Logo & Desktop Navigation Links */}
        <div className="flex items-center gap-6 md:gap-8">
          <Link href="/" prefetch={true} className="flex items-center gap-2.5 font-bold text-xl tracking-tighter group">
            <Logo className="w-7 h-7 sm:w-8 sm:h-8 drop-shadow-[0_0_8px_rgba(255,0,160,0.4)]" />
            <span>DROP<span className="text-muted-foreground">AGG.</span></span>
          </Link>

          <div className="hidden md:flex items-center gap-1 text-xs font-semibold">
            <Link
              href="/"
              prefetch={true}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors ${
                pathname === "/" && !isFavoritesOnly
                  ? "bg-muted font-bold text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>{t.navCatalog}</span>
            </Link>

            <Link
              href="/brands"
              prefetch={true}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors ${
                pathname === "/brands"
                  ? "bg-muted font-bold text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <Store className="w-3.5 h-3.5" />
              <span>{t.navBrands}</span>
            </Link>
          </div>
        </div>

        {/* Right Header Desktop Actions */}
        <div className="hidden md:flex items-center gap-3">
          {/* Favorites Button Toggle */}
          <button
            type="button"
            onClick={toggleFavorites}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all shadow-sm ${
              isFavoritesOnly
                ? "bg-red-500/10 border-red-500/30 text-red-500 font-bold"
                : "bg-muted/30 hover:bg-muted text-foreground border-border"
            }`}
            title={t.favorites}
          >
            <Heart className={`w-3.5 h-3.5 ${isFavoritesOnly ? "fill-red-500 text-red-500" : "text-muted-foreground"}`} />
            <span>{t.favorites}</span>
            {favCount > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${isFavoritesOnly ? "bg-red-500 text-white" : "bg-muted text-muted-foreground"}`}>
                {favCount}
              </span>
            )}
          </button>

          {/* Language Switcher (UA / EN) */}
          <LanguageSwitcher />

          {/* Sync All Stores Button */}
          <SyncAllButton />

          {/* Add Brand Modal Trigger */}
          <AddBrandModal />
        </div>

        {/* Mobile Header Quick Actions */}
        <div className="flex md:hidden items-center gap-2">
          {/* Favorites Icon Button */}
          <button
            type="button"
            onClick={toggleFavorites}
            className={`p-2 rounded-full border text-xs relative ${
              isFavoritesOnly
                ? "bg-red-500/10 border-red-500/30 text-red-500"
                : "bg-muted/30 border-border text-foreground"
            }`}
          >
            <Heart className={`w-4 h-4 ${isFavoritesOnly ? "fill-red-500 text-red-500" : "text-muted-foreground"}`} />
            {favCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                {favCount}
              </span>
            )}
          </button>

          {/* Add Brand Trigger */}
          <AddBrandModal />

          {/* Hamburger Mobile Menu Toggle Button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-lg border bg-muted/30 text-foreground hover:bg-muted transition-colors"
            aria-label="Toggle Mobile Menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

      </div>

      {/* Mobile Drawer Navigation Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b bg-background p-4 space-y-4 animate-in slide-in-from-top duration-200">
          <div className="grid grid-cols-2 gap-2 font-semibold text-xs">
            <Link
              href="/"
              onClick={() => setMobileMenuOpen(false)}
              className={`p-3 rounded-xl flex items-center justify-center gap-2 border transition-colors ${
                pathname === "/" && !isFavoritesOnly
                  ? "bg-primary/10 border-primary/30 text-primary font-bold"
                  : "bg-muted/20 border-border text-foreground"
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              <span>{t.navCatalog}</span>
            </Link>

            <Link
              href="/brands"
              onClick={() => setMobileMenuOpen(false)}
              className={`p-3 rounded-xl flex items-center justify-center gap-2 border transition-colors ${
                pathname === "/brands"
                  ? "bg-primary/10 border-primary/30 text-primary font-bold"
                  : "bg-muted/20 border-border text-foreground"
              }`}
            >
              <Store className="w-4 h-4" />
              <span>{t.navBrands}</span>
            </Link>
          </div>

          <div className="flex items-center justify-between pt-2 border-t text-xs">
            <span className="text-muted-foreground font-medium">Language / Мова:</span>
            <LanguageSwitcher />
          </div>

          <div className="pt-2 border-t flex justify-end">
            <SyncAllButton />
          </div>
        </div>
      )}
    </nav>
  );
}

export default function Navbar() {
  return (
    <Suspense fallback={<nav className="sticky top-0 z-50 w-full h-16 border-b bg-background" />}>
      <NavbarContent />
    </Suspense>
  );
}
