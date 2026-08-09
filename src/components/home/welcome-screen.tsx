"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Flame, Sparkles, Globe, Zap, PackageCheck, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/language-context";

const SAMPLE_BRANDS = [
  { name: "Riot Division", url: "https://riotdivision.tech" },
  { name: "LID Cyberstore", url: "https://www.lidcyberstore.com" },
  { name: "Bodega", url: "https://bdgastore.com" },
];

export function WelcomeScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAddStore = async (targetUrl: string) => {
    if (!targetUrl.trim()) return;

    setLoading(targetUrl);
    setError(null);

    try {
      const res = await fetch("/api/brands/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to add store");
      }

      router.refresh();
    } catch (err: any) {
      setError(err.message || "Failed to add store");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-12 px-4 space-y-12">
      {/* Hero Welcome */}
      <div className="text-center space-y-6">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-bold tracking-wide">
          <Flame className="w-4 h-4 text-orange-500" />
          {t.welcomeBadge}
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight uppercase">
          {t.welcomeTitle} <br className="hidden sm:inline" />
          <span className="text-muted-foreground">{t.welcomeSubtitle}</span>
        </h1>

        <p className="text-muted-foreground text-base sm:text-lg max-w-2xl mx-auto leading-relaxed">
          {t.welcomeDesc}
        </p>

        {/* Input & Add Button */}
        <div className="max-w-xl mx-auto pt-4 space-y-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAddStore(url);
            }}
            className="flex flex-col sm:flex-row gap-2"
          >
            <div className="relative flex-1">
              <Globe className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground" />
              <input
                type="url"
                placeholder={t.inputPlaceholder}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={!!loading}
                required
                className="w-full h-11 pl-10 pr-4 rounded-xl border bg-background text-sm shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>
            <Button
              type="submit"
              disabled={!!loading || !url.trim()}
              className="h-11 px-6 font-bold text-sm rounded-xl gap-2 shadow-md shrink-0"
            >
              {loading === url ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t.scanning}
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  {t.addFirstStore}
                </>
              )}
            </Button>
          </form>

          {error && (
            <p className="text-xs font-semibold text-destructive bg-destructive/10 p-2.5 rounded-lg border border-destructive/20 text-center">
              {error}
            </p>
          )}

          {/* Preset Sample Quick Add Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2 text-xs">
            <span className="text-muted-foreground text-[11px]">{t.trySample}</span>
            {SAMPLE_BRANDS.map((sample) => (
              <button
                key={sample.url}
                type="button"
                onClick={() => handleAddStore(sample.url)}
                disabled={!!loading}
                className="px-3 py-1 rounded-full border bg-muted/30 hover:bg-muted font-medium text-foreground transition-colors flex items-center gap-1.5"
              >
                {loading === sample.url ? (
                  <Loader2 className="w-3 h-3 animate-spin text-primary" />
                ) : (
                  <Sparkles className="w-3 h-3 text-primary" />
                )}
                <span>+ {sample.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Feature Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6">
        <div className="p-6 rounded-2xl border bg-card space-y-3 hover:shadow-md transition-shadow">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
            <Globe className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-lg">{t.feature1Title}</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t.feature1Desc}
          </p>
        </div>

        <div className="p-6 rounded-2xl border bg-card space-y-3 hover:shadow-md transition-shadow">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold">
            <Zap className="w-5 h-5 fill-emerald-500/20" />
          </div>
          <h3 className="font-bold text-lg">{t.feature2Title}</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t.feature2Desc}
          </p>
        </div>

        <div className="p-6 rounded-2xl border bg-card space-y-3 hover:shadow-md transition-shadow">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
            <PackageCheck className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-lg">{t.feature3Title}</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t.feature3Desc}
          </p>
        </div>
      </div>
    </div>
  );
}
