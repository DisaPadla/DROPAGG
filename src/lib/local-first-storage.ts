import { DropEventRecord } from "./drop-events";

export interface LocalCatalogVariant {
  id: string;
  size: string | null;
  color?: string | null;
  sku?: string | null;
  availability: string;
  rawPrice?: number | string | null;
  compareAtPrice?: number | string | null;
  normalizedPrice?: number | string | null;
  currency?: string | null;
  createdAt?: string | Date | null;
  isRestocked?: boolean;
  dropEvents?: DropEventRecord[] | null;
}

export interface LocalCatalogProduct {
  id: string;
  brandId?: string | null;
  canonicalUrl: string;
  externalId?: string | null;
  title: string;
  description?: string | null;
  category?: string | null;
  mainImage?: string | null;
  createdAt?: string | Date | null;
  isNewDrop?: boolean;
  isRestocked?: boolean;
  hasPriceDrop?: boolean;
  restockedSizes?: string[];
  brand?: {
    id?: string;
    name: string;
    domain?: string | null;
    platformType?: string | null;
    syncStatus?: string | null;
    baseCountry?: string | null;
    defaultCurrency?: string | null;
  } | null;
  variants?: LocalCatalogVariant[];
}

export interface LocalWorkspaceData {
  userId: string;
  timestamp: number;
  products: LocalCatalogProduct[];
  brands: string[];
  categories: string[];
}

const LOCAL_STORAGE_KEY_PREFIX = "dropagg_local_workspace_";

export function saveLocalWorkspace(userId: string, data: Omit<LocalWorkspaceData, "userId" | "timestamp">) {
  if (typeof window === "undefined") return;
  try {
    const payload: LocalWorkspaceData = {
      userId,
      timestamp: Date.now(),
      ...data,
    };
    localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}${userId}`, JSON.stringify(payload));
  } catch (e) {
    console.warn("[LocalFirst] Failed to save workspace locally", e);
  }
}

export function loadLocalWorkspace(userId: string): LocalWorkspaceData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}${userId}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn("[LocalFirst] Failed to load local workspace", e);
    return null;
  }
}
