# Задача №10: B2B-монетизация для локальных брендов (Promoted Drops, CPA-промокоды, Аналитика спроса)

## 1. Почему это нужно (Бизнес-ценность и Проблема)

Для устойчивой unit-экономики агрегатора недостаточно только B2C-подписок (`DropAgg PRO`). Локальные и независимые стритвир-бренды (украинские и восточноевропейские марки, нишевые techwear/archive проекты) тратят огромные бюджеты на таргетированную рекламу в Instagram/TikTok с высоким CAC ($15–$40 за покупателя), тогда как аудитория **DropAgg** уже приходит с готовым намерением купить одежду (`High Purchase Intent`).

Введение B2B-инструментов открывает **три прямых потока выручки от брендов**:
1. **Promoted Drops & Featured Brand Placement (CPC / Flat Fee)**:
   - Закрепление нового дропа или бренда в первых слотах выдачи каталога (`Sponsored / Featured Drop`), в блоке рекомендаций на главной и в шапке раздела `/brands`.
2. **Эксклюзивные партнерские промокоды (Affiliate / CPA Attribution)**:
   - Бейдж промокода прямо на карточке товара (например, `🎟 Код DROPAGG10 (-10%)` с копированием в 1 клик).
   - Повышает конверсию для пользователя и дает бренду 100% прозрачную атрибуцию продаж с агрегатора даже тогда, когда покупатель перешел в другой браузер и потерял UTM-куки.
3. **B2B-дашборд аналитики спроса и трекинга переходов (`/b2b` / Brand Partner Portal)**:
   - Бренды видят, сколько раз их товары просматривали, добавляли в `Favorites`, какие размеры (`S, M, L, XL`) чаще всего ищут в фильтрах, но не находят в наличии (`Lost Demand / Out-of-Stock Demand`), и сколько целевых переходов (`Outbound Clicks`) привел DropAgg.

---

## 2. Что мы делаем (Продуктовое и Архитектурное решение)

Реализуем полный контур B2B-монетизации и аналитики в 4 взаимосвязанных компонентах:

1. **Трекинг исходящих переходов и намерений (`OutboundClickLog` + UTM Attribution)**:
   - Все переходы на внешние магазины оборачиваются в трекер `/api/out` (или неблокирующий `navigator.sendBeacon("/api/analytics/click", ...)`), который логирует `brandId`, `productId`, выбранный в фильтре размер, источник (`catalog`, `steals`, `radar`, `curated_pack`) и добавляет `?utm_source=dropagg&utm_medium=aggregator&utm_campaign=...`.
2. **Нативное продвижение в выдаче (`isFeatured` / `isPromoted` + Promo Code Badge)**:
   - У модели `Brand` появляются поля партнерского статуса (`isFeatured`, `promoCode`, `promoDiscountLabel`, `sponsoredUntil`).
   - У модели `Product` появляется флаг `isPromoted`.
   - На карточках товаров партнерских брендов отображается аккуратный бейдж **`⚡ FEATURED`** и интерактивный чип промокода **`🎟 DROPAGG10 (-10%)`** (по клику копирует код в буфер обмена перед редиректом в магазин).
3. **B2B-портал аналитики для брендов (`/b2b` или `/brands/[id]/analytics`)**:
   - Визуальный дашборд для основателей и маркетологов брендов:
     - **Outbound Traffic**: Клики в магазин за 7 / 30 дней, CTR карточек.
     - **Size Demand vs Stock Matrix**: Уникальный отчет, показывающий, какие размеры (`M`, `L`, `XL`) пользователи пытались отфильтровать или добавить в снайпер рестоков, когда они были `OUT_OF_STOCK` (прямой сигнал производству бренда, какую партию дошивать!).
     - **Top Favorited Items**: Топ товаров бренда по сохранениям в вишлисты и кураторские паки.
4. **Self-Serve заявка на продвижение и верификацию бренда**:
   - Модальное окно / форма «🚀 Promote Your Brand on DropAgg» с выбором пакета (`Featured Brand Slot`, `Promoted Drop Push`, `Exclusive Promo Code Integration`).

---

## 3. Где вносятся изменения (Затронутые файлы и модули)

| Файл | Тип изменений | Описание |
| :--- | :--- | :--- |
| `prisma/schema.prisma` | Модификация | Поля `isFeatured`, `isVerified`, `promoCode`, `promoLabel`, `sponsoredPriority` в `Brand`; поле `isPromoted` в `Product`; новые таблицы `OutboundClickEvent` и `BrandPartnerLead`. |
| `src/lib/db-init.ts` | Модификация | Добавление колонок и таблиц `OutboundClickEvent`, `BrandPartnerLead`. |
| `src/lib/utm.ts` | **Новый файл** | Формирование партнерских ссылок с `utm_source=dropagg`, `utm_medium=aggregator`, `utm_campaign` и клиентский хелпер `trackOutboundClick()`. |
| `src/app/api/analytics/click/route.ts` | **Новый файл** | Прием событий кликов по карточкам товаров и копирования промокодов (`POST`), запись в `OutboundClickEvent`. |
| `src/app/api/b2b/analytics/route.ts` | **Новый файл** | Агрегация метрик по бренду: клики, популярные категории, матрица дефицита размеров (`Out-of-Stock Size Demand`). |
| `src/app/api/b2b/leads/route.ts` | **Новый файл** | Прием заявок от брендов на размещение `Promoted Drops` и партнерских промокодов. |
| `src/app/b2b/page.tsx` | **Новый файл** | B2B-страница для брендов: живой превью-дашборд аналитики по любому бренду из базы, калькулятор ROI и форма подключения промо-слота. |
| `src/components/catalog/pglite-catalog-view.tsx` | Модификация | Отображение бейджа `FEATURED` и кнопки копирования промокода `promoCode` на карточке товара, отправка события клика. |
| `src/components/brands/brands-list.tsx` | Модификация | Выделение верифицированных и Featured-брендов вверху списка `/brands` + ссылка на B2B-аналитику бренда. |

---

## 4. Как именно реализовать (Детальная техническая спецификация)

### 4.1. Расширение схемы БД (`prisma/schema.prisma`)

```prisma
model Brand {
  id                 String       @id @default(uuid())
  name               String
  domain             String       @unique
  platformType       PlatformType
  syncStatus         String       @default("ACTIVE")
  baseCountry        String
  defaultCurrency    String
  lastPolledHash     String?
  
  // B2B & Monetization Fields
  isVerified         Boolean      @default(false)
  isFeatured         Boolean      @default(false)
  sponsoredPriority  Int          @default(0)     // Чем выше, тем выше приоритет в Featured слотах
  promoCode          String?                      // Например: "DROPAGG10"
  promoLabel         String?                      // Например: "-10% з кодом DROPAGG10"
  
  createdAt          DateTime     @default(now())
  updatedAt          DateTime     @updatedAt

  products           Product[]
  userBrands         UserBrand[]
  clickEvents        OutboundClickEvent[]
}

model OutboundClickEvent {
  id            String   @id @default(uuid())
  brandId       String
  productId     String?
  userId        String?
  source        String   @default("catalog") // "catalog", "steals", "radar", "pack", "promo_copy"
  selectedSize  String?  // Размер, который искал пользователь в момент клика
  createdAt     DateTime @default(now())

  brand         Brand    @relation(fields: [brandId], references: [id], onDelete: Cascade)
  product       Product? @relation(fields: [productId], references: [id], onDelete: SetNull)

  @@index([brandId, createdAt])
  @@index([productId, createdAt])
}

model BrandPartnerLead {
  id          String   @id @default(uuid())
  brandName   String
  websiteUrl  String
  contactInfo String   // Telegram / Email
  packageType String   // "FEATURED_BRAND", "PROMOTED_DROP", "CPA_PROMO"
  notes       String?
  status      String   @default("NEW")
  createdAt   DateTime @default(now())
}
```

### 4.2. Алгоритм нативного размещения (`Sponsored Blending`)

Чтобы промо-товары не портили пользовательский опыт, в `src/app/page.tsx`:
1. При сортировке по умолчанию (`newest_drops`) первые **2 слота** в сетке (или 1 слот на каждые 12 органических карточек) могут занимать товары с `isPromoted: true` (или товары брендов с `isFeatured: true`), которые **строго соответствуют текущим фильтрам пользователя** (категория, пол, размер, максимальная цена).
2. Если пользователь отфильтровал `Hoodies` + размер `L`, ему никогда не покажется нерелевантный промо-товар из категории `Bags`. Это гарантирует высокий CTR (4–8%) и лояльность аудитории.

### 4.3. Интерактивный бейдж промокода на карточке (`Promo Code Chip`)

Если у `product.brand.promoCode` задано значение (например, `DROPAGG10`):
- Под ценой товара рендерится компактная кнопка:
  ```tsx
  <button
    type="button"
    onClick={(e) => {
      e.preventDefault();
      e.stopPropagation();
      navigator.clipboard.writeText(product.brand.promoCode);
      trackOutboundClick({
        brandId: product.brand.id,
        productId: product.id,
        source: "promo_copy",
      });
      setCopiedId(product.id);
    }}
    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-mono font-bold hover:bg-emerald-500/20"
  >
    🎟 {copiedId === product.id ? "COPIED!" : `${product.brand.promoCode} (${product.brand.promoLabel || "-10%"})`}
  </button>
  ```

### 4.4. Матрица упущенного спроса (`Out-of-Stock Size Demand`) в `/api/b2b/analytics`

Для выбранного `brandId` бэкенд агрегирует:
1. **Процент Sold Out по размерной сетке**: для каждого размера (`XS`, `S`, `M`, `L`, `XL`, `XXL`) считает, сколько вариантов бренда сейчас `OUT_OF_STOCK` vs `IN_STOCK`.
2. **Спрос по кликам и фильтрам**: сколько кликов (`OutboundClickEvent`) и подписок в `UserBrand` приходится на этот бренд.
3. Выводит рекомендацию для бренда: например, *«В категории Jackets 78% размеров L и XL раскуплены (OUT_OF_STOCK), при этом на них приходится 64% поисковых запросов пользователей DropAgg — рекомендуем ресток!»*.

---

## 5. Критерии приемки (Definition of Done)

- [ ] Все исходящие ссылки на товары снабжаются UTM-метками (`utm_source=dropagg&utm_medium=aggregator`) и логируют клики через `/api/analytics/click`.
- [ ] Бренды с `isFeatured` и `promoCode` отображают партнерский бейдж и интерактивный чип копирования промокода в 1 клик.
- [ ] Доступна страница `/b2b` с аналитикой по брендам (клики, наличие размеров, матрица дефицита размеров) и формой заявки на B2B-продвижение.
