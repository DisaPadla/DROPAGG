# Technical Design Document (TDD) & System Architecture Specification
**Project:** Streetwear & Fashion Store Aggregator (MVP)
**Role:** Principal Software Architect / Lead Engineering Manager

---

## 1. High-Level System Architecture Diagram

The architecture is designed to be engine-first for fast, scrape-free ingestion from e-commerce platforms, with an event-driven restock engine and a high-performance frontend.

```mermaid
flowchart TD
    %% Frontend Layer
    subgraph Client [Client / Frontend]
        UI[Next.js App Router Web UI]
    end

    %% Search & API Layer
    subgraph API [API & Search Layer]
        NextAPI[Next.js API Routes / tRPC]
        Search[Meilisearch / Typesense]
    end

    %% Data Ingestion Layer
    subgraph Ingestion [Data Ingestion & Drop Engine]
        Cron[Cron / Scheduler]
        Poller[Polling Worker (HEAD/Hash Check)]
        Worker[Ingestion Worker (Full Sync)]
        Queue[(BullMQ / Redis Queue)]
        Detector[Engine Auto-Detector]
    end

    %% Core Data Layer
    subgraph Data [Core Database]
        DB[(PostgreSQL)]
        Prisma[Prisma / Drizzle ORM]
    end
    
    %% External Integrations
    subgraph External [External Services]
        Shopify[Shopify API]
        WooCommerce[WooCommerce Feed]
        Tilda[Tilda API/Feed]
        ExchangeRates[Exchange Rate API]
    end

    %% Flow Connections
    Client <-->|Search & Filter| Search
    Client <-->|View Products| NextAPI
    NextAPI <--> Prisma
    Prisma <--> DB
    Search <..>|Sync| DB

    Cron -->|Trigger every 5-10m| Poller
    Poller -->|Check Hash/Headers| External
    Poller -->|Hash Changed? Enqueue| Queue
    Queue -->|Process Sync| Worker
    Worker --> Detector
    Detector -->|Fetch JSON Feed| External
    Worker -->|Update DB| Prisma
    Worker -->|Push DropEvents| Prisma
    
    Cron -->|Daily| ExchangeRates
    ExchangeRates -->|Update Rates| Prisma
```

---

## 2. Complete Database Schema Definition (Prisma)

This schema natively handles multi-currency normalization, multi-variant tracking (Size/Color), and drop event histories. It is designed to scale and support enterprise feeds in the future.

```prisma
// schema.prisma

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

enum PlatformType {
  SHOPIFY
  WOOCOMMERCE
  TILDA
  OPENCART
  CUSTOM
}

enum AvailabilityStatus {
  IN_STOCK
  OUT_OF_STOCK
}

model Brand {
  id               String       @id @default(uuid())
  name             String
  domain           String       @unique
  platformType     PlatformType
  syncStatus       String       @default("ACTIVE") // ACTIVE, PAUSED, ERROR
  baseCountry      String       // ISO 3166-1 alpha-2 e.g., 'US', 'UA'
  defaultCurrency  String       // ISO 4217 e.g., 'USD', 'UAH'
  lastPolledHash   String?      // Used for lightweight polling
  createdAt        DateTime     @default(now())
  updatedAt        DateTime     @updatedAt

  products         Product[]
}

model Product {
  id               String       @id @default(uuid())
  brandId          String
  canonicalUrl     String       @unique
  externalId       String?      // ID in the source system (e.g. Shopify Product ID)
  title            String
  description      String?
  category         String?
  mainImage        String
  
  createdAt        DateTime     @default(now())
  updatedAt        DateTime     @updatedAt

  brand            Brand        @relation(fields: [brandId], references: [id], onDelete: Cascade)
  variants         ProductVariant[]
}

model ProductVariant {
  id               String             @id @default(uuid())
  productId        String
  externalId       String?            // ID in the source system
  size             String?            // e.g., 'S', 'M', 'L', 'XL', 'OS'
  color            String?
  sku              String?
  availability     AvailabilityStatus @default(OUT_OF_STOCK)
  
  rawPrice         Decimal            @db.Decimal(10, 2)
  currency         String             // Base currency of this variant
  normalizedPrice  Decimal?           @db.Decimal(10, 2) // System default currency (e.g., USD)

  createdAt        DateTime           @default(now())
  updatedAt        DateTime           @updatedAt

  product          Product            @relation(fields: [productId], references: [id], onDelete: Cascade)
  dropEvents       DropEvent[]
  
  @@unique([productId, size, color])
}

model ExchangeRate {
  id               Int      @id @default(autoincrement())
  baseCurrency     String   @default("USD")
  targetCurrency   String   @unique
  rate             Decimal  @db.Decimal(14, 6)
  lastUpdated      DateTime @default(now())
}

model DropEvent {
  id               String             @id @default(uuid())
  variantId        String
  previousStatus   AvailabilityStatus
  newStatus        AvailabilityStatus
  timestamp        DateTime           @default(now())

  variant          ProductVariant     @relation(fields: [variantId], references: [id], onDelete: Cascade)
  
  @@index([variantId, timestamp])
}
```

---

## 3. Engine Auto-Detector Logic Specification

To classify a target URL's backend engine upon onboarding, the system will use a lightweight probing strategy rather than heavy scraping.

### Step-by-Step Algorithm:

1. **Initial `GET` Request (Homepage)**
   - Perform a simple GET request to the provided brand domain. Read the raw HTML response and Headers.
2. **Header Analysis (Fastest & Most Reliable)**
   - Check `X-ShopId` or `server` header: If it contains `cloudflare` and response cookies include `_shopify_y`, it is likely **Shopify**.
   - Check `X-Powered-By` header: If it contains `WooCommerce`, it is **WooCommerce**.
3. **DOM Signatures / Script Variables (If Headers Fail)**
   - **Shopify:** Look for `window.Shopify` or `cdn.shopify.com` in script/link tags.
   - **WooCommerce:** Look for `<meta name="generator" content="WooCommerce x.x">` or class `woocommerce` in the `<body>` tag.
   - **Tilda:** Look for `tilda-blocks` CSS classes or `<script src="https://static.tildacdn.com/..."></script>`.
4. **Feed Probing (Verification)**
   - **Shopify:** Probe `https://domain.com/products.json?limit=1`. If it returns valid JSON with a `products` array, confirm `SHOPIFY`.
   - **WooCommerce:** Probe `https://domain.com/wp-json/wc/v3/products` (might require auth, but often public feeds exist) or check for RSS feeds at `/feed/`.
5. **Fallback (Tier 2 / Tier 3)**
   - If all probes fail, mark platform as `CUSTOM`. The engine will then fallback to checking for OpenGraph tags or Schema.org `Product` JSON-LD on individual product pages.

---

## 4. Tech Stack Justification

| Component | Technology Choice | Justification |
| :--- | :--- | :--- |
| **Web Frontend** | **Next.js (App Router) + Tailwind CSS + Shadcn/ui** | SSR/SSG provides maximum SEO, crucial for an aggregator. App Router enables nested layouts and advanced caching. Tailwind + Shadcn allows for rapid, modular, and un-opinionated UI development with a premium feel suitable for streetwear aesthetics. |
| **Search & Filtering** | **Meilisearch / Typesense** | Faceted search at the variant level requires extreme performance (sub-50ms). Meilisearch/Typesense are lightweight, easily self-hostable (or cloud-managed), and natively support typo-tolerance and complex facet filtering (e.g., Size = XL AND In Stock). |
| **Queue & Ingestion** | **BullMQ + Redis** | The event-driven drop engine requires high-frequency polling and retries. BullMQ is mature, Redis-backed, and easily handles rate-limiting, job deduplication, and delayed jobs—perfect for scraping/ingestion queues. |
| **Database & ORM** | **PostgreSQL + Prisma** | Relational data integrity is critical for multi-currency handling and historical drop logs. PostgreSQL is battle-tested. Prisma provides end-to-end type safety, excellent developer ergonomics, and straightforward schema migrations. |

---

## 5. Multi-Currency Normalization Pipeline

Handling local streetwear brands globally requires a robust multi-currency approach. 

### Ingestion Time (Write Path)
1. **Fetch Live Rates:** A cron job fetches daily exchange rates from an API (e.g., OpenExchangeRates) and updates the `ExchangeRate` table. The system standardizes on a base currency (e.g., `USD`).
2. **Ingest Raw Prices:** When a product feed is ingested, the engine stores the `rawPrice` and `currency` exactly as provided by the brand (e.g., 2000 UAH).
3. **Normalize:** During the same ingestion transaction, the engine looks up the current exchange rate (e.g., UAH to USD) and calculates the `normalizedPrice`. Both are saved to the `ProductVariant`.

### Read Time (Search & Display Path)
1. **Search Indexing:** The search engine (Meilisearch/Typesense) indexes the `normalizedPrice` (USD). This allows users to reliably filter by price (e.g., "Under $50") regardless of the original currency.
2. **User Display Preference:** 
   - The user selects their preferred display currency (e.g., EUR) via a UI toggle (saved in a cookie/local storage).
   - On render, the frontend receives the `normalizedPrice` (USD) and applies the current USD-to-EUR exchange rate to display the localized price to the user.
   - For exactness, the UI can also display the original local price: *"€45.50 (Original: 2000 UAH)"*.

---

## 6. Implementation Roadmap (Sprints)

### Sprint 1: Foundation & Data Layer
- Setup PostgreSQL, Prisma schema, and initial database migrations.
- Implement the `ExchangeRate` sync cron job.
- Develop the **Engine Auto-Detector** script.

### Sprint 2: Ingestion Engine (Tier 1)
- Setup BullMQ and Redis.
- Implement the high-frequency Poller (`HEAD` request hash-checker) to monitor for updates.
- Develop the **Shopify JSON Feed Ingestor** worker (maps raw JSON to `Product` and `ProductVariant` tables).
- Implement the `DropEvents` generator (triggers when variant status flips from `OUT_OF_STOCK` to `IN_STOCK`).

### Sprint 3: Search Engine Integration
- Deploy Meilisearch/Typesense.
- Implement Prisma middleware / event listeners to sync `Product` and `ProductVariant` data to the search index upon DB updates.
- Configure search indices for faceted filtering (Size, Brand, Price, Availability).

### Sprint 4: Frontend Development (MVP)
- Scaffold Next.js App Router project with Tailwind and Shadcn/ui.
- Implement the homepage, product grid, and faceted search UI.
- Implement multi-currency display toggle on the frontend.
- Optimize mobile-first responsive design.

### Sprint 5: Refinement, Tier 2 Ingestion, and Launch
- Develop Tier 2 fallback extractor (JSON-LD / OpenGraph) for custom/unsupported platforms.
- End-to-end testing, error handling (dead letter queues), and rate-limit tuning.
- Deploy to production (Vercel for Next.js, Railway/Render for Postgres & Workers).
