"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((reg) => {
            console.log("[Service Worker] Registered successfully:", reg.scope);
          })
          .catch((err) => {
            console.warn("[Service Worker] Registration error:", err);
          });
      });
    }
  }, []);

  return null;
}
