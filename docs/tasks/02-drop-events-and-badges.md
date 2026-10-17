# Задача №2: Трекинг событий `DropEvent` (Рестоки, Новые дропы, Снижение цен) и бейджи `NEW DROP` / `RESTOCKED`

## 1. Контекст и продуктовая / бизнес-проблема (ПОЧЕМУ)

### 1.1. В чем суть проблемы в текущем коде
В архитектуре `DropAgg` изначально была заложена модель `DropEvent` в `prisma/schema.prisma` и таблица `"DropEvent"` в `src/lib/db-init.ts`:
```prisma
model DropEvent {
  id               String             @id @default(uuid())
  variantId        String
  previousStatus   AvailabilityStatus
  newStatus        AvailabilityStatus
  detectedAt       DateTime           @default(now())

  variant          ProductVariant     @relation(fields: [variantId], references: [id], onDelete: Cascade)
}
```
Однако при аудите кодовой базы выявлено, что **эта киллер-фича полностью мертва**:
1. **В инжесторах (`src/lib/serverless-ingestor.ts` и `src/workers/ingestor-shopify.ts`)** при парсинге товаров и вариантов вызывается слепой `prisma.productVariant.upsert(...)` без предварительного чтения текущего состояния варианта (`availability`, `rawPrice`). Таблица `DropEvent` всегда остается пустой (`0` записей).
2. **В серверной выборке (`src/app/page.tsx` и `src/app/api/sync/workspace/route.ts`)** запрос `prisma.product.findMany` загружает `variants: true`, но не включает связанные `dropEvents`.
3. **В клиентском PGlite-движке (`src/components/catalog/pglite-catalog-view.tsx`)** при синхронизации в WASM-таблицу `products` теряется поле `createdAt` товара и история `dropEvents` вариантов, из-за чего после гидратации клиент не может отличить свежий релиз (вышедший за последние 48 часов) от архивной вещи, добавленной месяц назад.
4. **На карточках товаров (`src/components/catalog/pglite-catalog-view.tsx` и `src/components/catalog/local-catalog-view.tsx`)** в левом верхнем углу выводится только имя бренда и бейдж `ПРОДАНО` (`SOLD OUT`), но полностью отсутствуют сигналы `NEW DROP` и `RESTOCKED`.

### 1.2. Бизнес- и продуктовая ценность
В индустрии стритвира (streetwear) и лимитированных локальных брендов потребление строится вокруг двух главных событий — **дропов (новых релизов)** и **рестоков (возвращения проданных размеров в наличие)**:
- **Триггер срочности и FOMO (Fear Of Missing Out)**: Когда пользователь открывает ленту агрегатора и видит на худи бейдж `NEW DROP` (вышел за последние 48 часов) или `RESTOCKED` (размер снова появился в стоке после Sold Out), вероятность перехода в магазин (Click-Out CTR) кратно возрастает.
- **Retention и ежедневная привычка (DAU/MAU)**: Без визуализации новых дропов и рестоков каталог выглядит статичной витриной. С появлением живых бейджей `NEW DROP` и `RESTOCKED` у пользователя появляется причина заходить в `DropAgg` каждый день и нажимать `Sync All`, чтобы первым поймать пополнение своего размера.
- **Фундамент для будущих уведомлений (Telegram / Web Push)**: Накопление истории `DropEvent` в БД для каждого варианта (`OUT_OF_STOCK -> IN_STOCK`, появление нового товара, снижение цены) создает готовую событийную шину для отправки алертов по товарам из `Favorites`.

---

## 2. Что именно нужно реализовать (ЧТО)

1. **Единый доменный модуль `src/lib/drop-events.ts`**:
   - Чистая детерминированная функция оценки переходов состояния варианта `evaluateVariantDropEvent(existingVariant, incomingVariant, isNewProduct)`.
   - Поддержка фиксации трех типов событий в `DropEvent`:
     1. **Restock (`RESTOCK`)**: вариант уже существовал в БД со статусом `OUT_OF_STOCK` и при новом парсинге перешел в статус `IN_STOCK` (`previousStatus: "OUT_OF_STOCK"`, `newStatus: "IN_STOCK"`).
     2. **New Drop (`NEW_DROP`)**: товар или его вариант появляется при парсинге впервые сразу в наличии (`!existingVariant && incomingVariant.availability === "IN_STOCK"`, записывается в `DropEvent` со статусом `previousStatus: "IN_STOCK"`, `newStatus: "IN_STOCK"`).
     3. **Price Drop (`PRICE_DROP`)**: вариант уже существовал в БД, находится в наличии (`IN_STOCK`), и его новая цена строго ниже предыдущей (`incomingVariant.rawPrice < Number(existingVariant.rawPrice)`, записывается в `DropEvent` с `previousStatus: existingVariant.availability`, `newStatus: "IN_STOCK"`).
   - Серверная функция `upsertVariantWithDropEvent(prismaClient, params)`, которая атомарно проверяет предыдущее состояние варианта, выполняет `upsert` варианта и при наступлении события создает запись в `prisma.dropEvent`.
   - Функции вычисления бейджей для UI:
     - `isProductNewDrop(product, nowMs)`: возвращает `true`, если товар вышел за последние **48 часов** (`48 * 60 * 60 * 1000` мс от `product.createdAt` или свежего `NEW_DROP` события при отсутствии `product.createdAt`).
     - `isProductRestocked(product, nowMs)`: возвращает `true`, если товар не распродан полностью (`!isSoldOut`) и хотя бы один его актуальный вариант имеет зафиксированное событие рестока (`previousStatus === "OUT_OF_STOCK" && newStatus === "IN_STOCK"`).
     - `getProductDropBadges(product, nowMs)`: возвращает вычисленные флаги `{ isNewDrop, isRestocked, hasPriceDrop, isSoldOut, restockedSizes }`.

2. **Интеграция трекинга `DropEvent` в парсеры (`serverless-ingestor.ts` и `ingestor-shopify.ts`)**:
   - Встроить проверку состояния варианта и запись `DropEvent` как в ветку **Tier 1 (Shopify JSON `/products.json`)**, так и в ветку **Tier 2 (Cheerio / OpenGraph / JSON-LD скрейпер для Tilda, Wix, WooCommerce, Custom HTML)** в обоих файлах:
     - `src/lib/serverless-ingestor.ts`
     - `src/workers/ingestor-shopify.ts`

3. **Сквозная передача `createdAt` и `dropEvents` от БД до UI**:
   - В `src/app/page.tsx` и `src/app/api/sync/workspace/route.ts` включить `dropEvents` (отсортированные по `detectedAt: "desc"`) в `include.variants` и предвычислять флаги `isNewDrop` и `isRestocked` при сериализации серверных данных.
   - В `src/lib/pglite-client.ts` и `src/components/catalog/pglite-catalog-view.tsx` сохранять `created_at` товара и метаданные `dropEvents` / бейджей при синхронизации с локальной PGlite WASM базой, чтобы после клиентской фильтрации и сортировки бейджи `NEW DROP` и `RESTOCKED` никогда не пропадали.

4. **Отображение бейджей `NEW DROP` и `RESTOCKED` на карточках товаров**:
   - В `src/components/catalog/pglite-catalog-view.tsx` и `src/components/catalog/local-catalog-view.tsx` выводить в стеке бейджей карточки:
     - Бейдж **`NEW DROP`** (изумрудно-зеленый / контрастный акцент с иконкой молнии/искры) для товаров, вышедших за последние 48 часов.
     - Бейдж **`RESTOCKED`** (янтарно-оранжевый / синий акцент с иконкой обновления) для товаров, получивших пополнение стока (`OUT_OF_STOCK -> IN_STOCK`).
   - Локализация (`uk` / `en`) текстов бейджей и подсказок в `src/lib/i18n.ts`.

---

## 3. Архитектура и затронутые файлы (ГДЕ)

| Файл | Роль в системе | Что изменяется / добавляется |
| :--- | :--- | :--- |
| `src/lib/drop-events.ts` *(новый)* | Доменное ядро `DropEvent` и логики бейджей | Константы окна 48ч (`NEW_DROP_WINDOW_MS`) и 7д (`RESTOCK_WINDOW_MS`), матрица переходов `evaluateVariantDropEvent`, хелпер `upsertVariantWithDropEvent`, селекторы `isProductNewDrop`, `isProductRestocked`, `getProductDropBadges`. |
| `src/lib/tier2-extractor.ts` | Экстрактор метаданных Tier 2 (JSON-LD / OG) | Извлечение статуса наличия `availability` (`IN_STOCK` / `OUT_OF_STOCK`) из `offers.availability` и `product:availability` для поддержки трекинга рестоков в не-Shopify магазинах. |
| `src/lib/serverless-ingestor.ts` | Serverless-парсер (Vercel / API Routes) | Замена слепого `productVariant.upsert` на `upsertVariantWithDropEvent` в ветках Tier 1 (Shopify) и Tier 2 (Custom HTML/Tilda) с трекингом `NEW_DROP`, `RESTOCK`, `PRICE_DROP`. |
| `src/workers/ingestor-shopify.ts` | Фоновый BullMQ-воркер парсинга | Аналогичная интеграция `upsertVariantWithDropEvent` для фоновых задач синхронизации в Tier 1 и Tier 2. |
| `src/app/page.tsx` | Server Component главной страницы | Загрузка `variants: { include: { dropEvents: { where: { detectedAt: { gte: ... } }, orderBy: { detectedAt: "desc" }, take: 20 } } }`, сериализация `detectedAt` и обогащение товаров флагами `isNewDrop`, `isRestocked`, `hasPriceDrop`. |
| `src/app/api/sync/workspace/route.ts` | API синхронизации локального воркспейса | Включение `dropEvents` (за окно `RESTOCK_WINDOW_MS`, `take: 20`) в выборку вариантов для корректной работы Local-First режима. |
| `src/lib/pglite-client.ts` | Клиентская WASM PostgreSQL (PGlite) | Добавление таблицы `drop_events` в схему локальной IndexedDB базы PGlite. |
| `src/components/catalog/pglite-catalog-view.tsx` | Основной клиентский каталог | Запись и выборка `drop_events` в PGlite WASM, сохранение `created_at` (`p.createdAt || null`), пересчет `getProductDropBadges` и рендеринг бейджей `NEW DROP` и `RESTOCKED` на карточке товара. |
| `src/components/catalog/local-catalog-view.tsx` | Local-First резервный вид каталога | Отображение бейджей `NEW DROP` и `RESTOCKED` в офлайн/резервном представлении каталога. |
| `src/lib/i18n.ts` | Словари локализации (`uk` / `en`) | Переводы для `newDrop`, `restocked`, `newDropTooltip`, `restockedTooltip`. |

---

## 4. Детальное техническое описание реализации (КАК)

### 4.1. Конечный автомат переходов `DropEvent` (`src/lib/drop-events.ts`)

Модель `DropEvent` в Prisma использует enum `AvailabilityStatus` (`IN_STOCK` | `OUT_OF_STOCK`) для полей `previousStatus` и `newStatus`. Чтобы без ломающих миграций БД однозначно кодировать и различать все три продуктовых сценария (**Restock**, **New Drop**, **Price Drop**), применяется следующая таблица переходов:

| Сценарий | Состояние варианта до парсинга (`existingVariant`) | Новое состояние (`incomingVariant`) | Создается `DropEvent`? | Запись в `DropEvent` (`previousStatus` -> `newStatus`) | Как интерпретируется на уровне товара |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. New Drop** (появление нового товара/варианта) | `null` (варианта еще не было в БД) | `availability === "IN_STOCK"` | **Да (`NEW_DROP`)** | `IN_STOCK` -> `IN_STOCK` | Товар получает `isNewDrop = true` (в течение 48ч с момента `product.createdAt` / `v.createdAt` / `detectedAt`). Не путается с `RESTOCKED`, так как `previousStatus !== "OUT_OF_STOCK"`. |
| **2. Новый вариант сразу Sold Out** | `null` | `availability === "OUT_OF_STOCK"` | **Нет** | — | Если сам `Product` создан <= 48ч назад, карточка покажет `NEW DROP` + `SOLD OUT`. |
| **3. Restock** (пополнение размера) | Существует, `availability === "OUT_OF_STOCK"` | `availability === "IN_STOCK"` | **Да (`RESTOCK`)** | `OUT_OF_STOCK` -> `IN_STOCK` | Товар получает `isRestocked = true` и бейдж `RESTOCKED` (пока вариант остается `IN_STOCK` и событие входит в 7-дневное окно `RESTOCK_WINDOW_MS`). |
| **4. Price Drop** (снижение цены) | Существует, `rawPrice > incoming.rawPrice` (разница >= `0.01`) | `availability === "IN_STOCK"` | **Да (`PRICE_DROP`)** | `existing.availability` -> `IN_STOCK` | Фиксируется в `DropEvent` (а если одновременно произошел ресток `OUT_OF_STOCK -> IN_STOCK`, приоритет отдается типу `RESTOCK` без дублирования записи). |
| **5. Без изменений / Выход из стока** | Существует (`IN_STOCK` или `OUT_OF_STOCK`) | Цена не снизилась, перехода `OUT_OF_STOCK -> IN_STOCK` нет | **Нет** | — | Новая запись в `DropEvent` не создается (защита от замусоривания таблицы при каждом 5-минутном поллинге). |

#### Реализация `evaluateVariantDropEvent`:
```ts
export const NEW_DROP_WINDOW_HOURS = 48;
export const NEW_DROP_WINDOW_MS = NEW_DROP_WINDOW_HOURS * 60 * 60 * 1000;
export const RESTOCK_WINDOW_DAYS = 7;
export const RESTOCK_WINDOW_MS = RESTOCK_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export type DropEventType = "RESTOCK" | "NEW_DROP" | "PRICE_DROP";

export function evaluateVariantDropEvent(
  existingVariant: ExistingVariantSnapshot | null | undefined,
  incomingVariant: IncomingVariantSnapshot
): DetectedDropChange {
  const newStatus: AvailabilityStatus =
    incomingVariant.availability === "IN_STOCK" ? "IN_STOCK" : "OUT_OF_STOCK";
  const newPrice = toNumericPrice(incomingVariant.rawPrice);

  // Сценарий 1: Вариант обнаружен впервые (New Drop)
  if (!existingVariant) {
    if (newStatus === "IN_STOCK") {
      return {
        shouldRecord: true,
        eventType: "NEW_DROP",
        previousStatus: "IN_STOCK",
        newStatus: "IN_STOCK",
        newPrice: Number.isFinite(newPrice) ? newPrice : undefined,
      };
    }
    return {
      shouldRecord: false,
      eventType: null,
      previousStatus: "OUT_OF_STOCK",
      newStatus: "OUT_OF_STOCK",
    };
  }

  const prevStatus: AvailabilityStatus =
    existingVariant.availability === "IN_STOCK" ? "IN_STOCK" : "OUT_OF_STOCK";
  const prevPrice = toNumericPrice(existingVariant.rawPrice);

  // Сценарий 2: Ресток (OUT_OF_STOCK -> IN_STOCK)
  if (prevStatus === "OUT_OF_STOCK" && newStatus === "IN_STOCK") {
    return {
      shouldRecord: true,
      eventType: "RESTOCK",
      previousStatus: "OUT_OF_STOCK",
      newStatus: "IN_STOCK",
      previousPrice: Number.isFinite(prevPrice) ? prevPrice : undefined,
      newPrice: Number.isFinite(newPrice) ? newPrice : undefined,
    };
  }

  // Сценарий 3: Снижение цены (Price Drop) при наличии товара
  const isPriceDropped =
    Number.isFinite(prevPrice) &&
    Number.isFinite(newPrice) &&
    prevPrice > 0 &&
    newPrice > 0 &&
    prevPrice - newPrice >= 0.01;

  if (newStatus === "IN_STOCK" && isPriceDropped) {
    return {
      shouldRecord: true,
      eventType: "PRICE_DROP",
      previousStatus: prevStatus,
      newStatus: "IN_STOCK",
      previousPrice: prevPrice,
      newPrice: newPrice,
    };
  }

  return {
    shouldRecord: false,
    eventType: null,
    previousStatus: prevStatus,
    newStatus: newStatus,
  };
}
```

---

### 4.2. Интеграция в `serverless-ingestor.ts`, `ingestor-shopify.ts` и `tier2-extractor.ts`

Вместо прямого вызова `prisma.productVariant.upsert(...)` оба инжестора вызывают `upsertVariantWithDropEvent(prisma, ...)`:
1. Сначала выполняется `prisma.productVariant.findUnique` по составному ключу `productId_size_color: { productId, size, color }` (выбираются только поля `id`, `availability`, `rawPrice`).
2. Затем выполняется `prisma.productVariant.upsert(...)` с актуальными данными варианта (включая `compareAtPrice`, если передан).
3. Вызывается `evaluateVariantDropEvent(existingVariant, { availability, rawPrice })`.
4. Если `evaluation.shouldRecord === true`, создается запись в `prisma.dropEvent.create({ data: { variantId: variant.id, previousStatus: evaluation.previousStatus, newStatus: evaluation.newStatus } })`.
5. В `src/lib/tier2-extractor.ts` добавлен разбор `availability` (`IN_STOCK` / `OUT_OF_STOCK`) из JSON-LD (`offer.availability`) и OpenGraph (`product:availability` / `og:availability`), чтобы магазины на Tilda, Wix, WooCommerce и Custom HTML также фиксировали переходы `OUT_OF_STOCK -> IN_STOCK`.

---

### 4.3. Алгоритм определения бейджей `NEW DROP` и `RESTOCKED` на карточке товара

Функция `getProductDropBadges(product, nowMs = Date.now())` в `src/lib/drop-events.ts` обрабатывает как серверные объекты Prisma, так и десериализованные клиентские объекты из PGlite / LocalStorage:

1. **Проверка `isNewDrop` (вышел за последние 48 часов)**:
   - Если у `product` задано валидное поле `createdAt`:
     - Вычисляется возраст товара `ageMs = nowMs - new Date(product.createdAt).getTime()`.
     - Товар считается `NEW DROP`, если `ageMs <= 48 * 60 * 60 * 1000` (48 часов) и `ageMs >= -5 * 60 * 1000` (допуск на рассинхрон часов).
   - Если `product.createdAt` отсутствует, проверяются `v.createdAt` вариантов (если у вариантов есть валидный `createdAt`, но все они старше 48 часов, возвращается `false`, чтобы не спутать `PRICE_DROP` со свежим дропом).
   - Если `v.createdAt` также отсутствует, проверяются события `v.dropEvents` (наличие `IN_STOCK -> IN_STOCK` в пределах 48 часов при отсутствии более старых событий или истории рестоков), и только в самом конце — резервный булев флаг `product.isNewDrop`.

2. **Проверка `isRestocked` (возвращение в наличие `OUT_OF_STOCK -> IN_STOCK`)**:
   - Если все варианты товара сейчас находятся в статусе `OUT_OF_STOCK` (`isSoldOut === true`), то `isRestocked = false` (товар снова раскуплен, показывается бейдж `SOLD OUT`).
   - Иначе проверяется наличие хотя бы у одного доступного варианта (`v.availability !== "OUT_OF_STOCK"`) записи в `v.dropEvents`, где `previousStatus === "OUT_OF_STOCK" && newStatus === "IN_STOCK"` в пределах окна актуальности рестока `RESTOCK_WINDOW_MS` (7 дней).
   - Если у вариантов загружены массивы `dropEvents`, их результат является авторитетным (устаревший булев флаг `product.isRestocked` из кеша не перезаписывает `false`, когда окно 7 дней истекло или ресток-вариант снова ушел в `OUT_OF_STOCK`).
   - Дополнительно возвращается список размеров `restockedSizes: string[]`, которые были пополнены, чтобы отобразить их в `title` / подсказке бейджа.

---

### 4.4. Сохранение данных в PGlite (`pglite-catalog-view.tsx`)

В `src/components/catalog/pglite-catalog-view.tsx` устраняется потеря метаданных при синхронизации с локальной WASM-базой:
- При `INSERT INTO products` передается `p.createdAt || null` (чтобы товары без `createdAt` не получали `new Date().toISOString()` и не превращались в ложные `NEW DROP`), а в `SELECT` возвращается `p.created_at as "createdAt"`.
- События `v.dropEvents` каждого варианта сохраняются в таблицу `drop_events` PGlite (`INSERT INTO drop_events ... ON CONFLICT (id) DO NOTHING`) и агрегируются обратно в `SELECT` через подзапрос `json_agg(...) FROM drop_events de WHERE de.variant_id = pv.id`.
- После гидратации строк из PGlite вызывается `getProductDropBadges(hydratedProduct)` для актуализации флагов `isNewDrop`, `isRestocked`, `hasPriceDrop` и `restockedSizes`.

---

### 4.5. Визуальный дизайн бейджей на карточке товара

В левом верхнем углу карточки товара (`top-2.5 left-2.5`) под названием бренда рендерятся:
- **`NEW DROP`**:
  - Стиль: `bg-emerald-500/95 text-white border-0 shadow-sm backdrop-blur-sm text-[9px] sm:text-[10px] font-black uppercase tracking-wider py-0.5 px-2 flex items-center gap-1 w-fit`
  - Иконка: `Sparkles` (`w-2.5 h-2.5 fill-current`)
  - Текст: `NEW DROP` (`data-badge="new-drop"`).
- **`RESTOCKED`**:
  - Стиль: `bg-amber-500/95 text-black border-0 shadow-sm backdrop-blur-sm text-[9px] sm:text-[10px] font-black uppercase tracking-wider py-0.5 px-2 flex items-center gap-1 w-fit`
  - Иконка: `RotateCcw` (`w-2.5 h-2.5`)
  - Текст: `RESTOCKED` (`data-badge="restocked"`, с подсказкой в `title`, перечисляющей вернувшиеся размеры, например: `Back in stock (size restocked): M, L`).

---

## 5. Граничные случаи (Edge Cases) и защита от ошибок

1. **Защита от ложного `RESTOCKED` при первом парсинге нового товара**:
   - Когда магазин парсится впервые, у него еще нет записей `ProductVariant`. За счет записи `previousStatus: "IN_STOCK", newStatus: "IN_STOCK"` для новых вариантов они корректно классифицируются как `NEW_DROP`, а `RESTOCKED` срабатывает строго при переходе уже существовавшего варианта из `OUT_OF_STOCK` в `IN_STOCK`.
2. **Товар рестокнулся, но снова полностью или частично продан (`Sold Out`)**:
   - Если после рестока все размеры снова разобрали (`isSoldOut === true`), либо конкретный рестокнутый размер снова перешел в `OUT_OF_STOCK`, бейдж `RESTOCKED` автоматически снимается даже при наличии старого флага `product.isRestocked = true` в кеше.
3. **Защита от вытеснения события рестока при частых снижениях цены**:
   - В `src/app/page.tsx` и `src/app/api/sync/workspace/route.ts` выборка `dropEvents` фильтруется по окну `detectedAt >= now - RESTOCK_WINDOW_MS` с лимитом `take: 20`, чтобы серия последующих `PRICE_DROP` событий не вытесняла активное событие `RESTOCK`.
4. **Истечение 48 часов у `NEW DROP` и отличие от `PRICE_DROP`**:
   - Проверка `isProductNewDrop(product)` учитывает `product.createdAt`, `v.createdAt` и историю `dropEvents`, гарантируя, что снижение цены (`IN_STOCK -> IN_STOCK`) у старого товара никогда не вызовет ложный бейдж `NEW DROP`.
5. **Отказоустойчивость при ошибках записи `DropEvent`**:
   - Создание записи в `DropEvent` внутри `upsertVariantWithDropEvent` обернуто в защитный `try/catch`, чтобы любая нештатная ошибка логирования события не прервала основной пайплайн сохранения товара и вариантов.

