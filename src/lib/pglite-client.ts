import { PGlite } from "@electric-sql/pglite";

let dbInstance: PGlite | null = null;
let initPromise: Promise<PGlite> | null = null;

export async function getPGliteInstance(): Promise<PGlite> {
  if (typeof window === "undefined") {
    throw new Error("PGlite WASM engine can only run in the browser client.");
  }

  if (dbInstance) return dbInstance;

  if (!initPromise) {
    initPromise = (async () => {
      // Initialize in-memory / IndexedDB PGlite instance
      const instance = new PGlite();

      await instance.exec(`
        CREATE TABLE IF NOT EXISTS brands (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          domain TEXT UNIQUE NOT NULL,
          platform_type TEXT,
          sync_status TEXT DEFAULT 'ACTIVE',
          base_country TEXT,
          default_currency TEXT
        );

        CREATE TABLE IF NOT EXISTS products (
          id TEXT PRIMARY KEY,
          brand_id TEXT NOT NULL,
          canonical_url TEXT UNIQUE,
          external_id TEXT,
          title TEXT NOT NULL,
          description TEXT,
          category TEXT,
          main_image TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS product_variants (
          id TEXT PRIMARY KEY,
          product_id TEXT NOT NULL,
          size TEXT,
          color TEXT,
          sku TEXT,
          availability TEXT DEFAULT 'OUT_OF_STOCK',
          raw_price NUMERIC,
          currency TEXT,
          normalized_price NUMERIC
        );
      `);

      dbInstance = instance;
      return dbInstance;
    })();
  }

  return initPromise;
}
