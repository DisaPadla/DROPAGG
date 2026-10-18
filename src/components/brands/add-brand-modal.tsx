"use client";

import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Plus, X, Globe, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/language-context";
import { addOrSyncStoreByUrl } from "@/lib/local-db";

const emptySubscribe = () => () => {};

export function AddBrandModal() {
  const router = useRouter();
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const result = await addOrSyncStoreByUrl(url.trim());

      setSuccessMsg(result.message || "Brand added to your device!");
      setUrl("");

      setTimeout(() => {
        setIsOpen(false);
        setSuccessMsg(null);
        const isBrandsPage = window.location.pathname === "/brands";
        if (!isBrandsPage) {
          router.push("/");
        }
      }, 400);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const modalContent = isOpen ? (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md p-6 bg-background rounded-2xl border shadow-2xl space-y-6 my-auto">
        
        {/* Close button */}
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground p-1 rounded-full hover:bg-muted transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold">
            <Sparkles className="w-3.5 h-3.5" />
            {t.modalTagline}
          </div>
          <h2 className="text-2xl font-bold tracking-tight">{t.modalTitle}</h2>
          <p className="text-xs text-muted-foreground">
            {t.modalDesc}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <div className="relative">
              <Globe className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <input
                type="url"
                placeholder={t.modalPlaceholder}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
                disabled={loading}
                className="w-full h-10 pl-9 pr-3 rounded-lg border bg-background text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-xs font-semibold text-destructive">
              {error}
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs font-semibold text-emerald-500">
              {successMsg}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={loading}
              className="text-xs"
            >
              {t.cancel}
            </Button>
            <Button
              type="submit"
              disabled={loading || !url.trim()}
              className="text-xs font-bold gap-1.5"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {t.scanning}
                </>
              ) : (
                t.addStore
              )}
            </Button>
          </div>
        </form>

      </div>
    </div>
  ) : null;

  return (
    <>
      <Button
        type="button"
        onClick={() => setIsOpen(true)}
        className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-4 py-2 text-sm rounded-lg flex items-center gap-1.5 shadow-sm transition-all"
      >
        <Plus className="w-4 h-4" />
        {t.addBrand}
      </Button>

      {mounted && modalContent && createPortal(modalContent, document.body)}
    </>
  );
}
