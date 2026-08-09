export interface LocalWorkspaceData {
  userId: string;
  timestamp: number;
  products: any[];
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
