"use client";

const FAVORITES_KEY = "dropagg_favorites";

export function getLocalFavorites(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("Failed to read favorites from localStorage", e);
    return [];
  }
}

export function isFavorite(productId: string): boolean {
  const favorites = getLocalFavorites();
  return favorites.includes(productId);
}

export function toggleFavorite(productId: string): boolean {
  if (typeof window === "undefined") return false;
  const favorites = getLocalFavorites();
  const index = favorites.indexOf(productId);
  let next: string[];

  if (index >= 0) {
    next = favorites.filter((id) => id !== productId);
  } else {
    next = [...favorites, productId];
  }

  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("dropagg_favorites_change"));
  } catch (e) {
    console.error("Failed to save favorites to localStorage", e);
  }

  return index < 0; // returns true if now favorited
}
