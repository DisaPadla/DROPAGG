"use client";

import { useEffect, useState, useCallback } from "react";
import { LocalCatalogProduct, LocalCatalogVariant } from "./local-first-storage";
import {
  evaluateVariantDropEvent,
  getProductDropBadges,
  DropEventRecord,
} from "./drop-events";
import { resolveVariantCurrency, getVariantPriceInUsd } from "./currency";

export interface LocalBrand {
  id: string;
  name: string;
  domain: string;
  platformType: string;
  syncStatus: "ACTIVE" | "SYNCING" | "FAILED";
  baseCountry: string;
  defaultCurrency: string;
  createdAt: string;
  updatedAt: string;
}

export interface LocalStoreSnapshot {
  hydrated: boolean;
  brands: LocalBrand[];
  products: LocalCatalogProduct[];
}

const IDB_NAME = "dropagg_device_db_v1";
const IDB_VERSION = 1;
const STORE_BRANDS = "brands";
const STORE_PRODUCTS = "products";

const LS_BRANDS_KEY = "dropagg_device_brands_v1";
const LS_PRODUCTS_KEY = "dropagg_device_products_v1";
const CHANGE_EVENT = "dropagg_local_db_change";
const BROADCAST_CHANNEL_NAME = "dropagg_local_db_channel";

let memorySnapshot: LocalStoreSnapshot = {
  hydrated: false,
  brands: [],
  products: [],
};

let hydrationPromise: Promise<LocalStoreSnapshot> | null = null;
let idbPromise: Promise<IDBDatabase | null> | null = null;
let broadcastChannel: BroadcastChannel | null = null;

function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return null;
  }
  if (!broadcastChannel) {
    try {
      broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      broadcastChannel.onmessage = () => {
        reloadSnapshotFromDisk().catch(() => {});
      };
    } catch {
      return null;
    }
  }
  return broadcastChannel;
}

function openLocalIDB(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") {
    return Promise.resolve(null);
  }
  if (idbPromise) return idbPromise;

  idbPromise = new Promise((resolve) => {
    try {
      const request = indexedDB.open(IDB_NAME, IDB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_BRANDS)) {
          db.createObjectStore(STORE_BRANDS, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(STORE_PRODUCTS)) {
          const prodStore = db.createObjectStore(STORE_PRODUCTS, { keyPath: "id" });
          prodStore.createIndex("brandId", "brandId", { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        console.warn("[LocalDB] IndexedDB open failed, falling back to localStorage:", request.error);
        resolve(null);
      };
    } catch (err) {
      console.warn("[LocalDB] IndexedDB exception, falling back to localStorage:", err);
      resolve(null);
    }
  });

  return idbPromise;
}

async function idbGetAll<T>(storeName: string): Promise<T[] | null> {
  const db = await openLocalIDB();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as T[]) || []);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbWriteAll(brands: LocalBrand[], products: LocalCatalogProduct[]): Promise<void> {
  const db = await openLocalIDB();
  if (db) {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction([STORE_BRANDS, STORE_PRODUCTS], "readwrite");
        const brandStore = tx.objectStore(STORE_BRANDS);
        const productStore = tx.objectStore(STORE_PRODUCTS);

        brandStore.clear();
        for (const b of brands) {
          brandStore.put(b);
        }

        productStore.clear();
        for (const p of products) {
          productStore.put(p);
        }

        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  // Keep lightweight localStorage backup for instant synchronous fallback
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(LS_BRANDS_KEY, JSON.stringify(brands));
      localStorage.setItem(LS_PRODUCTS_KEY, JSON.stringify(products));
    } catch {
      // Ignore quota errors if catalog is very large; IndexedDB holds full dataset
    }
  }
}

function readLocalStorageBackup(): { brands: LocalBrand[]; products: LocalCatalogProduct[] } {
  if (typeof window === "undefined") {
    return { brands: [], products: [] };
  }
  try {
    const rawBrands = localStorage.getItem(LS_BRANDS_KEY);
    const rawProducts = localStorage.getItem(LS_PRODUCTS_KEY);
    return {
      brands: rawBrands ? JSON.parse(rawBrands) : [],
      products: rawProducts ? JSON.parse(rawProducts) : [],
    };
  } catch {
    return { brands: [], products: [] };
  }
}

function emitStoreChange(broadcast = true) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  if (broadcast) {
    try {
      getBroadcastChannel()?.postMessage({ type: "SYNC", timestamp: Date.now() });
    } catch {
      // Ignore BroadcastChannel errors
    }
  }
}

function enrichProduct(product: LocalCatalogProduct, brand?: LocalBrand): LocalCatalogProduct {
  const brandDefaultCurrency =
    brand?.defaultCurrency || product.brand?.defaultCurrency || "USD";
  const variants: LocalCatalogVariant[] = (product.variants || []).map((v) => {
    const rawPrice = v.rawPrice != null ? Number(v.rawPrice) : 0;
    const compareAtPrice = v.compareAtPrice != null ? Number(v.compareAtPrice) : null;
    const currency = resolveVariantCurrency(v, brandDefaultCurrency);
    const normalizedPrice = getVariantPriceInUsd(
      { ...v, rawPrice, currency },
      brandDefaultCurrency
    );
    return {
      ...v,
      rawPrice,
      compareAtPrice,
      currency,
      normalizedPrice,
      dropEvents: Array.isArray(v.dropEvents) ? v.dropEvents : [],
    };
  });

  const hydrated: LocalCatalogProduct = {
    ...product,
    brandId: brand?.id || product.brandId || product.brand?.id || "",
    brand: brand
      ? {
          id: brand.id,
          name: brand.name,
          domain: brand.domain,
          platformType: brand.platformType,
          syncStatus: brand.syncStatus,
          baseCountry: brand.baseCountry,
          defaultCurrency: brand.defaultCurrency,
        }
      : product.brand,
    variants,
  };

  const badges = getProductDropBadges(hydrated);
  return {
    ...hydrated,
    isNewDrop: badges.isNewDrop,
    isRestocked: badges.isRestocked,
    hasPriceDrop: badges.hasPriceDrop,
    restockedSizes: badges.restockedSizes,
  };
}

export async function reloadSnapshotFromDisk(): Promise<LocalStoreSnapshot> {
  if (typeof window === "undefined") return memorySnapshot;

  const [idbBrands, idbProducts] = await Promise.all([
    idbGetAll<LocalBrand>(STORE_BRANDS),
    idbGetAll<LocalCatalogProduct>(STORE_PRODUCTS),
  ]);

  let brands: LocalBrand[] = [];
  let products: LocalCatalogProduct[] = [];

  if (idbBrands && (idbBrands.length > 0 || (idbProducts && idbProducts.length > 0))) {
    brands = idbBrands;
    products = idbProducts || [];
  } else {
    const backup = readLocalStorageBackup();
    brands = backup.brands;
    products = backup.products;
    if (brands.length > 0 || products.length > 0) {
      await idbWriteAll(brands, products);
    }
  }

  brands.sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );

  const brandMap = new Map(brands.map((b) => [b.id, b]));
  const enrichedProducts = products
    .map((p) => enrichProduct(p, brandMap.get(p.brandId || p.brand?.id || "")))
    .sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA;
    });

  memorySnapshot = {
    hydrated: true,
    brands,
    products: enrichedProducts,
  };

  emitStoreChange(false);
  return memorySnapshot;
}

export async function ensureLocalStoreHydrated(): Promise<LocalStoreSnapshot> {
  if (memorySnapshot.hydrated) return memorySnapshot;
  if (!hydrationPromise) {
    getBroadcastChannel();
    hydrationPromise = reloadSnapshotFromDisk().finally(() => {
      hydrationPromise = null;
    });
  }
  return hydrationPromise;
}

export function getLocalStoreSnapshot(): LocalStoreSnapshot {
  return memorySnapshot;
}

/**
 * Upserts a brand and merges its scraped products into the device-local IndexedDB,
 * evaluating variant state transitions (NEW_DROP, RESTOCK, PRICE_DROP) locally.
 */
export async function upsertLocalBrandAndProducts(
  incomingBrand: Partial<LocalBrand> & { domain: string; name: string },
  incomingProducts: LocalCatalogProduct[],
  options: { syncStatus?: "ACTIVE" | "SYNCING" | "FAILED" } = {}
): Promise<{ brand: LocalBrand; totalBrandProducts: number }> {
  await ensureLocalStoreHydrated();

  const nowIso = new Date().toISOString();
  const cleanDomain = incomingBrand.domain.replace(/^www\./, "").toLowerCase();
  const deterministicBrandId = incomingBrand.id || `brand_${cleanDomain}`;

  const existingBrand = memorySnapshot.brands.find(
    (b) => b.id === deterministicBrandId || b.domain.toLowerCase() === cleanDomain
  );

  const brandId = existingBrand?.id || deterministicBrandId;
  const savedBrand: LocalBrand = {
    id: brandId,
    name: incomingBrand.name || existingBrand?.name || cleanDomain.split(".")[0].toUpperCase(),
    domain: cleanDomain,
    platformType: incomingBrand.platformType || existingBrand?.platformType || "SHOPIFY",
    syncStatus: options.syncStatus || incomingBrand.syncStatus || "ACTIVE",
    baseCountry: incomingBrand.baseCountry || existingBrand?.baseCountry || "US",
    defaultCurrency: incomingBrand.defaultCurrency || existingBrand?.defaultCurrency || "USD",
    createdAt: existingBrand?.createdAt || incomingBrand.createdAt || nowIso,
    updatedAt: nowIso,
  };

  const otherBrands = memorySnapshot.brands.filter(
    (b) => b.id !== brandId && b.domain.toLowerCase() !== cleanDomain
  );
  const nextBrands = [savedBrand, ...otherBrands].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  // Index existing products for this brand by canonicalUrl or id to preserve history & detect restocks
  const existingBrandProducts = memorySnapshot.products.filter(
    (p) => (p.brandId || p.brand?.id) === brandId || p.brand?.domain?.toLowerCase() === cleanDomain
  );
  const existingProdByUrl = new Map<string, LocalCatalogProduct>();
  for (const ep of existingBrandProducts) {
    if (ep.canonicalUrl) existingProdByUrl.set(ep.canonicalUrl, ep);
    existingProdByUrl.set(ep.id, ep);
  }

  const mergedBrandProductsMap = new Map<string, LocalCatalogProduct>();
  for (const ep of existingBrandProducts) {
    mergedBrandProductsMap.set(ep.canonicalUrl || ep.id, enrichProduct(ep, savedBrand));
  }

  for (const incomingProd of incomingProducts) {
    const lookupKey = incomingProd.canonicalUrl || incomingProd.id;
    const existingProd =
      existingProdByUrl.get(incomingProd.canonicalUrl) ||
      existingProdByUrl.get(incomingProd.id);

    const productId = existingProd?.id || incomingProd.id || `prod_${lookupKey}`;
    const existingVariantMap = new Map<string, LocalCatalogVariant>();
    for (const ev of existingProd?.variants || []) {
      const vKey = `${(ev.size || "OS").toUpperCase()}__${(ev.color || "DEFAULT").toUpperCase()}`;
      existingVariantMap.set(vKey, ev);
      if (ev.id) existingVariantMap.set(ev.id, ev);
    }

    const mergedVariants: LocalCatalogVariant[] = (incomingProd.variants || []).map((iv, idx) => {
      const size = iv.size || "OS";
      const color = iv.color || "DEFAULT";
      const vKey = `${size.toUpperCase()}__${color.toUpperCase()}`;
      const existingVar = existingVariantMap.get(vKey) || (iv.id ? existingVariantMap.get(iv.id) : undefined);

      const variantId = existingVar?.id || iv.id || `${productId}_v_${idx}_${size}`;
      const rawPrice = iv.rawPrice != null ? Number(iv.rawPrice) : 0;
      const availability = iv.availability === "IN_STOCK" ? "IN_STOCK" : "OUT_OF_STOCK";

      const prevDropEvents: DropEventRecord[] = Array.isArray(existingVar?.dropEvents)
        ? [...existingVar.dropEvents]
        : Array.isArray(iv.dropEvents)
        ? [...iv.dropEvents]
        : [];

      const evaluation = evaluateVariantDropEvent(
        existingVar
          ? {
              id: existingVar.id,
              availability:
                existingVar.availability === "IN_STOCK" ? "IN_STOCK" : "OUT_OF_STOCK",
              rawPrice: existingVar.rawPrice,
            }
          : null,
        {
          availability,
          rawPrice,
        }
      );

      if (evaluation.shouldRecord) {
        // Avoid duplicating initial NEW_DROP if variant already has a drop event
        const isDuplicateNewDrop =
          evaluation.eventType === "NEW_DROP" && prevDropEvents.length > 0;
        if (!isDuplicateNewDrop) {
          prevDropEvents.unshift({
            id: `de_${variantId}_${Date.now()}`,
            variantId,
            previousStatus: evaluation.previousStatus,
            newStatus: evaluation.newStatus,
            detectedAt: nowIso,
          });
        }
      }

      return {
        ...iv,
        id: variantId,
        size,
        color,
        availability,
        rawPrice,
        compareAtPrice: iv.compareAtPrice != null ? Number(iv.compareAtPrice) : null,
        currency: resolveVariantCurrency(iv, savedBrand.defaultCurrency),
        normalizedPrice: getVariantPriceInUsd(iv, savedBrand.defaultCurrency),
        createdAt: existingVar?.createdAt || iv.createdAt || incomingProd.createdAt || nowIso,
        dropEvents: prevDropEvents.slice(0, 20),
      };
    });

    const mergedProduct: LocalCatalogProduct = enrichProduct(
      {
        ...incomingProd,
        id: productId,
        brandId: savedBrand.id,
        createdAt: existingProd?.createdAt || incomingProd.createdAt || nowIso,
        variants: mergedVariants,
      },
      savedBrand
    );

    mergedBrandProductsMap.set(lookupKey, mergedProduct);
  }

  const otherProducts = memorySnapshot.products.filter(
    (p) => (p.brandId || p.brand?.id) !== brandId && p.brand?.domain?.toLowerCase() !== cleanDomain
  );

  const updatedBrandProducts = Array.from(mergedBrandProductsMap.values());
  const nextProducts = [...updatedBrandProducts, ...otherProducts].sort((a, b) => {
    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return timeB - timeA;
  });

  memorySnapshot = {
    hydrated: true,
    brands: nextBrands,
    products: nextProducts,
  };

  await idbWriteAll(nextBrands, nextProducts);
  emitStoreChange(true);

  return {
    brand: savedBrand,
    totalBrandProducts: updatedBrandProducts.length,
  };
}

export async function updateLocalBrandStatus(
  brandId: string,
  syncStatus: "ACTIVE" | "SYNCING" | "FAILED"
): Promise<void> {
  await ensureLocalStoreHydrated();
  const nextBrands = memorySnapshot.brands.map((b) =>
    b.id === brandId ? { ...b, syncStatus, updatedAt: new Date().toISOString() } : b
  );
  memorySnapshot = {
    ...memorySnapshot,
    brands: nextBrands,
  };
  await idbWriteAll(nextBrands, memorySnapshot.products);
  emitStoreChange(true);
}

export async function deleteLocalBrand(brandId: string): Promise<void> {
  await ensureLocalStoreHydrated();
  const targetBrand = memorySnapshot.brands.find((b) => b.id === brandId);
  const nextBrands = memorySnapshot.brands.filter((b) => b.id !== brandId);
  const nextProducts = memorySnapshot.products.filter((p) => {
    if ((p.brandId || p.brand?.id) === brandId) return false;
    if (targetBrand && p.brand?.domain?.toLowerCase() === targetBrand.domain.toLowerCase()) {
      return false;
    }
    return true;
  });

  memorySnapshot = {
    hydrated: true,
    brands: nextBrands,
    products: nextProducts,
  };

  await idbWriteAll(nextBrands, nextProducts);
  emitStoreChange(true);
}

export interface ScrapeStoreResponse {
  success: boolean;
  error?: string;
  message?: string;
  brand: LocalBrand;
  products: LocalCatalogProduct[];
  processedCount: number;
  page: number;
  hasMore: boolean;
  nextPage?: number;
}

/**
 * Scrapes a store URL via the stateless server proxy and saves all pages
 * directly into the user's local IndexedDB.
 */
export async function addOrSyncStoreByUrl(
  url: string,
  options: {
    onFirstPageSaved?: (brand: LocalBrand, count: number) => void;
    onPageProgress?: (page: number, totalLoaded: number) => void;
  } = {}
): Promise<{ brand: LocalBrand; totalSynced: number; message: string }> {
  await ensureLocalStoreHydrated();

  const res = await fetch("/api/brands/suggest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: url.trim(), page: 1 }),
  });

  const data: ScrapeStoreResponse = await res.json();
  if (!res.ok || !data.brand) {
    throw new Error(data.error || "Failed to scan store");
  }

  let totalSynced = (data.products || []).length;
  let hasMore = Boolean(data.hasMore);
  let nextPage = data.nextPage || 2;

  const { brand: savedBrand } = await upsertLocalBrandAndProducts(
    data.brand,
    data.products || [],
    { syncStatus: hasMore ? "SYNCING" : "ACTIVE" }
  );

  options.onFirstPageSaved?.(savedBrand, totalSynced);

  // Fetch remaining pages in background if the store has >250 products
  if (hasMore) {
    (async () => {
      try {
        while (hasMore && nextPage <= 20) {
          options.onPageProgress?.(nextPage, totalSynced);
          const pageRes = await fetch("/api/brands/suggest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url: `https://${savedBrand.domain}`,
              page: nextPage,
              brandMeta: savedBrand,
            }),
          });
          if (!pageRes.ok) break;
          const pageData: ScrapeStoreResponse = await pageRes.json();
          const pageProducts = pageData.products || [];
          totalSynced += pageProducts.length;
          hasMore = Boolean(pageData.hasMore) && pageProducts.length > 0;
          nextPage = pageData.nextPage || nextPage + 1;

          await upsertLocalBrandAndProducts(savedBrand, pageProducts, {
            syncStatus: hasMore ? "SYNCING" : "ACTIVE",
          });
        }
      } catch (err) {
        console.warn("[LocalDB] Background page sync error:", err);
      } finally {
        await updateLocalBrandStatus(savedBrand.id, "ACTIVE");
      }
    })();
  }

  return {
    brand: savedBrand,
    totalSynced,
    message: data.message || `Added ${savedBrand.name} to your device!`,
  };
}

/**
 * Re-syncs an existing local brand by domain and updates products + drop events locally.
 */
export async function syncLocalBrandById(
  brandId: string,
  onProgress?: (page: number, totalSynced: number) => void
): Promise<number> {
  await ensureLocalStoreHydrated();
  const brand = memorySnapshot.brands.find((b) => b.id === brandId);
  if (!brand) throw new Error("Brand not found on device");

  await updateLocalBrandStatus(brand.id, "SYNCING");

  let page = 1;
  let totalSynced = 0;
  let hasMore = true;

  try {
    while (hasMore && page <= 20) {
      onProgress?.(page, totalSynced);
      const res = await fetch("/api/brands/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: `https://${brand.domain}`,
          page,
          brandMeta: brand,
        }),
      });

      if (!res.ok) {
        throw new Error(`Sync failed with status ${res.status}`);
      }

      const data: ScrapeStoreResponse = await res.json();
      const pageProducts = data.products || [];
      totalSynced += pageProducts.length;
      hasMore = Boolean(data.hasMore) && pageProducts.length > 0;
      page = data.nextPage || page + 1;

      await upsertLocalBrandAndProducts(
        {
          ...brand,
          ...(data.brand || {}),
          id: brand.id,
        },
        pageProducts,
        { syncStatus: hasMore ? "SYNCING" : "ACTIVE" }
      );
    }
  } finally {
    await updateLocalBrandStatus(brand.id, "ACTIVE");
  }

  return totalSynced;
}

/**
 * Syncs all locally stored brands sequentially.
 */
export async function syncAllLocalBrands(): Promise<void> {
  await ensureLocalStoreHydrated();
  const brandsToSync = [...memorySnapshot.brands];
  for (const brand of brandsToSync) {
    try {
      await syncLocalBrandById(brand.id);
    } catch (err) {
      console.warn(`[LocalDB] Failed syncing ${brand.name}:`, err);
    }
  }
}

/**
 * React hook for subscribing to the local device catalog (IndexedDB + in-memory cache).
 */
export function useLocalCatalog() {
  const [snapshot, setSnapshot] = useState<LocalStoreSnapshot>(memorySnapshot);

  useEffect(() => {
    let mounted = true;

    const handleUpdate = () => {
      if (mounted) {
        setSnapshot({ ...getLocalStoreSnapshot() });
      }
    };

    window.addEventListener(CHANGE_EVENT, handleUpdate);
    ensureLocalStoreHydrated().then((hydratedSnap) => {
      if (mounted) {
        setSnapshot({ ...hydratedSnap });
      }
    });

    return () => {
      mounted = false;
      window.removeEventListener(CHANGE_EVENT, handleUpdate);
    };
  }, []);

  const refresh = useCallback(async () => {
    const snap = await reloadSnapshotFromDisk();
    setSnapshot({ ...snap });
  }, []);

  return {
    hydrated: snapshot.hydrated,
    brands: snapshot.brands,
    products: snapshot.products,
    refresh,
    addOrSyncStoreByUrl,
    syncLocalBrandById,
    syncAllLocalBrands,
    deleteLocalBrand,
  };
}
