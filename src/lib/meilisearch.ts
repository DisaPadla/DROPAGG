import { Meilisearch } from "meilisearch";

// Initialize Meilisearch Client
// In a real environment, use process.env.MEILISEARCH_HOST and process.env.MEILISEARCH_API_KEY
export const meiliClient = new Meilisearch({
  host: process.env.MEILISEARCH_HOST || 'http://127.0.0.1:7700',
  apiKey: process.env.MEILISEARCH_API_KEY || 'masterKey1234567890',
});

// We create a unified "products" index that will hold denormalized data
export const PRODUCTS_INDEX = 'products';

/**
 * Initializes and configures the Meilisearch index.
 * This should be run on startup or via a setup script.
 */
export async function setupSearchIndex() {
  const index = meiliClient.index(PRODUCTS_INDEX);
  
  // 1. Faceted Filtering Configuration
  // We need to filter by these attributes on the catalog page.
  await index.updateFilterableAttributes([
    'brand',
    'category',
    'variants.size',
    'variants.availability',
    'variants.normalizedPrice' // Always filter by the normalized USD price
  ]);

  // 2. Sorting Configuration
  await index.updateSortableAttributes([
    'createdAt',
    'variants.normalizedPrice'
  ]);

  // 3. Searchable Attributes (Typos allowed here)
  await index.updateSearchableAttributes([
    'title',
    'brand',
    'description',
    'category'
  ]);

  console.log('[Search] Meilisearch index configured successfully.');
}
