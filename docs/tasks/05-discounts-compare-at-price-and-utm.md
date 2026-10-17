# Задача №5: Сохранение скидок (`compare_at_price`), UTM-разметка и аналитика исходящих кликов

## 1. Описание проблемы и продуктовая / бизнес-ценность (Почему)

### 1.1. Потеря данных о скидках (`compare_at_price`)
В сегменте уличной моды (streetwear) и локальных брендов сезонные распродажи (Archive Sale, Mid-Season Sale) и снижение цен — один из главных триггеров конверсии в покупку.
- **Техническая проблема:** Публичный JSON-фид Shopify (`/products.json`) для каждого варианта товара возвращает поле `compare_at_price` (старая цена до скидки) наряду с `price` (текущая цена). Аналогично, на кастомных сайтах (Tilda, WooCommerce, Custom HTML) старая цена часто присутствует в микроразметке или верстке. Однако текущие инжесторы (`src/lib/serverless-ingestor.ts` и `src/workers/ingestor-shopify.ts`) и схема БД (`ProductVariant`) игнорируют `compare_at_price`, сохраняя только `rawPrice`.
- **Продуктовое влияние:** Пользователь видит товар за `$65`, но не знает, что его исходная цена составляла `$100` (скидка `-35%`). Теряется ощущение выгоды и срочности покупки.

### 1.2. Отсутствие UTM-разметки на исходящих ссылках
- **Техническая проблема:** Все ссылки на товары (`product.canonicalUrl` в `PGliteCatalogView`) и на домены магазинов (`brands-list.tsx`) ведут напрямую на чистый URL без UTM-меток.
- **Бизнес-влияние:** Владельцы брендов в своей аналитике (Shopify Analytics, Google Analytics 4) видят переходы из DropAgg как `Direct` (из-за `rel="noopener noreferrer"`) или неструктурированный реферальный трафик. Прибавление `?utm_source=dropagg&utm_medium=aggregator` делает трафик агрегатора прозрачным и измеримым для магазинов — это фундамент для B2B-партнерств, подключения affiliate-программ (CPA / RevShare) и запроса эксклюзивных промокодов для пользователей платформы.

### 1.3. Отсутствие логирования исходящих кликов (Outbound Click Tracking)
- **Техническая проблема:** При клике пользователя на карточку товара происходит прямой переход во внешнюю вкладку (`target="_blank"`), и бэкенд агрегатора никак не фиксирует это действие.
- **Продуктовое влияние:** Команда продукта не видит главную метрику агрегатора (North Star Metric) — **Click-Out Rate / CTR**, не знает, какие бренды и товары генерируют реальный покупательский трафик, и не может строить отчеты для магазинов-партнеров.

---

## 2. Архитектура решения и точки изменений (Где и Что)

| Компонент / Файл | Тип изменений | Описание |
| :--- | :--- | :--- |
| `prisma/schema.prisma` | Схема БД | Добавление поля `compareAtPrice Decimal? @db.Decimal(10, 2)` в `ProductVariant` и новой модели `OutboundClick` для хранения логов переходов. |
| `src/lib/db-init.ts` | Миграция / Auto-init | Добавление `ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "compareAtPrice" DECIMAL(10, 2)` и `CREATE TABLE IF NOT EXISTS "OutboundClick"` в `ensureTablesExist()`. |
| `src/lib/pglite-client.ts` | Локальная WASM БД | Добавление колонки `compare_at_price NUMERIC` в таблицу `product_variants` (включая `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` для существующих IndexedDB-инстансов). |
| `src/lib/tier2-extractor.ts` | Парсер Tier 2 | Расширение интерфейса `ExtractedProduct` полем `compareAtPrice?: number` и извлечение старой цены из JSON-LD, OpenGraph и HTML-селекторов. |
| `src/lib/serverless-ingestor.ts` | Инжестор (Serverless) | Парсинг `sv.compare_at_price` из Shopify JSON и `meta.compareAtPrice` из Tier 2, валидация (`compareAtPrice > rawPrice`) и сохранение в `ProductVariant`. |
| `src/workers/ingestor-shopify.ts` | Фоновый воркер BullMQ | Синхронная поддержка `compareAtPrice` при фоновом парсинге Shopify и Tier 2. |
| `src/app/page.tsx` | Server Component | Сериализация `compareAtPrice` из `Prisma.Decimal` в `number \| null` при передаче в клиентские компоненты. |
| `src/lib/currency.ts` | Утилита цен и скидок | Расчет процента скидки (`getProductDiscountInfo`), форматирование старой цены (`formatCompareAtPrice`) с учетом валюты и выбранного режима отображения. |
| `src/lib/utm.ts` | Утилита UTM и кликов | Функции `appendUtmParams(url)` для добавления `utm_source=dropagg&utm_medium=aggregator` и `trackOutboundClick(payload)` для неблокирующей отправки аналитики (`sendBeacon` / `fetch keepalive`). |
| `src/app/api/clicks/route.ts` | API Route | Серверный эндпоинт `POST /api/clicks` для записи кликов в таблицу `OutboundClick` и `GET /api/clicks` для получения сводной статистики. |
| `src/components/catalog/pglite-catalog-view.tsx` | UI Каталога | Отображение бейджа `-X%` на карточке, перечеркнутой старой цены, подстановка UTM-ссылок и вызов `trackOutboundClick` по клику. |
| `src/components/catalog/local-catalog-view.tsx` | UI Local-First | Отображение бейджа скидки, старой цены, UTM-разметки и логирования кликов в режиме локального каталога. |
| `src/components/brands/brands-list.tsx` | UI Списка брендов | Добавление UTM-разметки и трекинга кликов при переходе на внешний домен бренда. |

---

## 3. Детальное техническое описание реализации (Как)

### 3.1. Изменения в базе данных (`prisma/schema.prisma`, `db-init.ts`, `pglite-client.ts`)

1. **Модель `ProductVariant` в Prisma:**
   ```prisma
   model ProductVariant {
     // ... существующие поля
     rawPrice         Decimal            @db.Decimal(10, 2)
     compareAtPrice   Decimal?           @db.Decimal(10, 2) // Старая цена до скидки (если > rawPrice)
     currency         String
     normalizedPrice  Decimal?           @db.Decimal(10, 2)
   }
   ```

2. **Модель `OutboundClick` в Prisma:**
   ```prisma
   model OutboundClick {
     id          String   @id @default(uuid())
     productId   String?
     brandId     String?
     userId      String?
     targetUrl   String
     source      String   @default("catalog")
     clickedAt   DateTime @default(now())

     product     Product? @relation(fields: [productId], references: [id], onDelete: SetNull)
     brand       Brand?   @relation(fields: [brandId], references: [id], onDelete: SetNull)

     @@index([productId])
     @@index([brandId])
     @@index([clickedAt])
   }
   ```

3. **Безопасная инициализация (`src/lib/db-init.ts`):**
   Так как база может уже содержать таблицу `ProductVariant` без колонки `compareAtPrice`, помимо `CREATE TABLE IF NOT EXISTS` выполняется идемпотентный запрос:
   ```sql
   ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "compareAtPrice" DECIMAL(10, 2);
   ```
   И создается таблица `"OutboundClick"` с внешними ключами `ON DELETE SET NULL`.

4. **Локальная база PGlite (`src/lib/pglite-client.ts`):**
   В `getPGliteInstance()` таблица `product_variants` дополняется полем `compare_at_price NUMERIC`, а также выполняется `ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS compare_at_price NUMERIC;` для бесшовного обновления уже созданных в браузере IndexedDB баз (`idb://dropagg-db`).

---

### 3.2. Извлечение `compareAtPrice` при парсинге

1. **Shopify JSON Feed (`src/lib/serverless-ingestor.ts` и `src/workers/ingestor-shopify.ts`):**
   В объекте варианта Shopify (`sv`) поле `compare_at_price` может быть `null`, `""`, строкой `"120.00"` или числом, которое иногда равно или меньше текущей цены `sv.price`.
   Правило нормализации:
   ```ts
   const rawPrice = parseFloat(sv.price);
   const parsedCompareAt = sv.compare_at_price ? parseFloat(sv.compare_at_price) : null;
   const compareAtPrice =
     parsedCompareAt !== null && !isNaN(parsedCompareAt) && parsedCompareAt > rawPrice
       ? parsedCompareAt
       : null;
   ```
   При `upsert` варианта значение `compareAtPrice` передается и в `create`, и в `update`. Благодаря передаче `null` в `update`, если скидка в магазине закончилась, старая цена корректно очистится в БД.

2. **Tier 2 Extractor (`src/lib/tier2-extractor.ts`):**
   Для магазинов не на Shopify (Tilda, WooCommerce, кастомные сайты) добавляется извлечение `compareAtPrice`:
   - Из JSON-LD `offers`: проверка `highPrice` (если `highPrice > price`) или `priceSpecification`.
   - Из мета-тегов: `meta[property="product:original_price:amount"]`, `meta[property="og:price:standard_amount"]`.
   - Из DOM-разметки (fallback): поиск первого валидного числа в типичных селекторах перечеркнутой цены (`del .amount`, `.price--compare`, `.was-price`, `.old-price`, `.js-store-prod-price-old`, `.t-store__card__price-old-value`).
   - Сохраняется только в том случае, если `compareAtPrice > price`.

---

### 3.3. Расчет скидки и отображение в UI (`src/lib/currency.ts`, `src/lib/utm.ts`, `pglite-catalog-view.tsx`)

1. **Выбор репрезентативного варианта (`selectRepresentativeVariant` в `src/lib/currency.ts`) и расчет скидки (`getProductDiscountInfo`):**
   Чтобы текущая цена (`formatProductPrice`), старая перечеркнутая цена (`formatCompareAtPrice`) и бейдж скидки (`getProductDiscountInfo`) всегда ссылались на один и тот же вариант товара (исключая ситуацию, когда текущая цена берется из `variants[0]`, а старая цена — из `variants[1]`), используется единая функция `selectRepresentativeVariant(variants)`:
   - Если у товара есть варианты `IN_STOCK`, выбирается первый `IN_STOCK` вариант с валидной скидкой (`compareAtPrice > rawPrice`), либо первый доступный `IN_STOCK` вариант. (Скидки на `OUT_OF_STOCK` размеры игнорируются, пока товар есть в наличии по полной цене).
   - Если все варианты `OUT_OF_STOCK` (товар полностью распродан), выбирается первый вариант со скидкой, либо `variants[0]`.
   ```ts
   export interface ProductDiscountInfo {
     hasDiscount: boolean;
     discountPercent: number | null; // например, 35 (для бейджа -35%)
     rawPrice: number;
     compareAtPrice: number | null;
     normalizedPrice: number | null;
     normalizedCompareAtPrice: number | null;
     currency: string;
     compareAtProduct: any | null;
   }
   ```
   Процент скидки вычисляется через `calculateDiscountPercent(rawPrice, compareAtPrice)` как `Math.round(((compareAtPrice - rawPrice) / compareAtPrice) * 100)` и ограничивается диапазоном `1..99`. Функции экспортируются как из `src/lib/currency.ts`, так и из `src/lib/utm.ts`.

2. **Визуализация на карточке товара (`PGliteCatalogView` и `LocalCatalogView`):**
   - **Бейдж скидки:** В левом верхнем углу карточки (в стеке бейджей) отображается заметный бейдж `-35%` (`bg-rose-600 text-white font-black`).
   - **Блок цены:** Текущая цена выводится акцентным цветом (`text-rose-500` при наличии скидки), а справа от нее — перечеркнутая старая цена (`line-through text-muted-foreground/60 text-xs font-normal`), отформатированная в активной валюте пользователя (`UAH / USD / EUR`).

---

### 3.4. UTM-разметка и API-логирование кликов (`src/lib/utm.ts`, `src/app/api/clicks/route.ts`)

1. **Формирование UTM-ссылки (`appendUtmParams` в `src/lib/utm.ts`):**
   ```ts
   export function appendUtmParams(
     rawUrl: string | null | undefined,
     extraParams?: Record<string, string>
   ): string
   ```
   - Принимает исходный `canonicalUrl` (или домен бренда).
   - Блокирует небезопасные схемы (`javascript:`, `data:`, `vbscript:`), возвращая `"#"`.
   - Поддерживает абсолютные (`https://...`), protocol-relative (`//store.com/...`), доменные (`store.com/...`) и относительные (`/products/...`) ссылки без дублирования UTM-параметров при повторном вызове.
   - Устанавливает `utm_source=dropagg` и `utm_medium=aggregator` (плюс опциональные параметры), сохраняя существующие query-параметры (`?variant=123`) и якоря (`#size`).

2. **Клиентский трекер (`trackOutboundClick` в `src/lib/utm.ts`):**
   - Формирует JSON-пэйлоад `{ productId, brandId, brandName, targetUrl, source }`.
   - Использует `navigator.sendBeacon("/api/clicks", blob)` как основной механизм (гарантирует доставку запроса браузером без блокировки UI и потери пакета при навигации), с фоллбеком на `fetch("/api/clicks", { method: "POST", body, keepalive: true })`.

3. **Серверный эндпоинт (`src/app/api/clicks/route.ts`):**
   - `POST /api/clicks`:
     - Валидирует `targetUrl` (отклоняет пустые строки, `"#"` и невалидные схемы со статусом `400`).
     - Определяет `userId` из тела запроса или cookie `user_id`.
     - Сохраняет запись в таблицу `OutboundClick` через Prisma (с защитным вызовом `ensureTablesExist()` при первом обращении, если таблица еще не создана).
     - Логирует событие `[OutboundClick]` на сервере и возвращает `{ success: true, persisted, click }`.
   - `GET /api/clicks`:
     - Возвращает общее количество кликов (`totalClicks`) и список последних 50 переходов (`clicks`) для быстрой верификации и аналитики.

---

## 4. План верификации и пограничные случаи (Edge Cases)

1. **`compare_at_price` равен `null`, `0`, `""` или меньше/равен `price`:**
   - Сохраняется как `null`, бейдж скидки и зачеркнутая цена **не** отображаются.
2. **Товары с несколькими вариантами (Multi-variant consistency):**
   - Если `variants[0]` не имеет скидки или `OUT_OF_STOCK`, а `variants[1]` `IN_STOCK` со скидкой, и `formatProductPrice`, и `formatCompareAtPrice` используют `variants[1]`. Если `IN_STOCK` варианты продаются без скидки, а скидка осталась только на `OUT_OF_STOCK` размере, ложная скидка не показывается.
3. **Разделители тысяч в ценах Tier 2 (`$1,200.00`, `2.500,00 €`, `65,50`):**
   - Парсер `parsePriceNumber` в `src/lib/tier2-extractor.ts` корректно различает разделители тысяч и дробной части, а также поддерживает `@graph` в JSON-LD и связку `product:sale_price:amount` + `product:original_price:amount`.
4. **URL товара уже содержит query-параметры (например, `https://store.com/products/tee?variant=42`):**
   - `appendUtmParams` добавляет `&utm_source=dropagg&utm_medium=aggregator`, не ломая существующий `variant=42` и не дублируя метки при повторном вызове.
5. **Невалидный, пустой или небезопасный `canonicalUrl` (`""`, `"#"`, `"javascript:..."`):**
   - `appendUtmParams` возвращает `"#"`, а `POST /api/clicks` возвращает `400 Bad Request`.
6. **Отказоустойчивость логирования кликов:**
   - Даже если БД временно недоступна или пользователь офлайн (Local-First режим), клик по карточке мгновенно открывает магазин в новой вкладке без ошибок в интерфейсе.
