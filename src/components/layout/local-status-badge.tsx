"use client";

import { useEffect, useState } from "react";
import { Zap, WifiOff } from "lucide-react";

export function LocalStatusBadge() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return (
    <div
      className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors ${
        isOnline
          ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
          : "bg-amber-500/10 border-amber-500/20 text-amber-500"
      }`}
      title={
        isOnline
          ? "Local First Engine Active: All data synced & cached locally on your device"
          : "Offline Mode Active: Serving cached catalog data from Local Storage"
      }
    >
      {isOnline ? (
        <>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <Zap className="w-3 h-3 text-emerald-500" />
          <span>Local First</span>
        </>
      ) : (
        <>
          <WifiOff className="w-3 h-3 text-amber-500" />
          <span>Offline (Local Cache)</span>
        </>
      )}
    </div>
  );
}
