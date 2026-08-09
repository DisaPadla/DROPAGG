"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Check } from "lucide-react";
import { useLanguage } from "@/context/language-context";

export function SyncAllButton() {
  const router = useRouter();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSyncAll = async () => {
    if (loading) return;

    setLoading(true);
    setSuccess(false);

    try {
      const res = await fetch("/api/brands/sync-all", {
        method: "POST",
      });

      if (res.ok) {
        setSuccess(true);
        router.refresh();
        setTimeout(() => setSuccess(false), 3000);
      } else {
        alert("Failed to sync stores");
      }
    } catch (e) {
      console.error("Sync all failed", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleSyncAll}
      disabled={loading}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all shadow-sm ${
        success
          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
          : "bg-muted/30 hover:bg-muted text-foreground border-border"
      }`}
      title={t.syncAll}
    >
      {success ? (
        <>
          <Check className="w-3.5 h-3.5 text-emerald-500" />
          <span>{t.allStoresSynced}</span>
        </>
      ) : (
        <>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-primary" : "text-muted-foreground"}`} />
          <span className="hidden sm:inline">{loading ? t.syncingAll : t.syncAll}</span>
        </>
      )}
    </button>
  );
}
