# Задача №7: Раздел «🔥 Steals & Archive Sales» (Автоматическая витрина вещей со скидкой 30–70%)

## 1. Почему это нужно (Бизнес-ценность и Проблема)

Охота за скидками на локальные и мировые стритвир-бренды (Archive Sales, End-of-Season Sales, Last Piece Steals) — один из самых мощных драйверов органического трафика и импульсивных покупок:
- **Проблема пользователя**: Бренды редко объявляют о точечных скидках на отдельные архивные позиции, либо прячут их глубоко в своих разделах `Sale / Archive`. Искать вручную вещи со скидкой 40–70% в 30 разных магазинах невозможно.
- **Проблема бизнеса**: В текущей базе товары со скидкой никак не выделяются в отдельный продуктовый сценарий. Выделенная страница **«🔥 Steals & Archive Sales»** (`/steals`):
  - Имеет самую высокую конверсию в партнерский клик (Outbound CTR в 2.5–3 раза выше обычного каталога).
  - Идеально подходит для вирального шеринга в Telegram-каналах и TikTok («Топ-10 стритвир-вещей со скидкой 50%+ прямо сейчас»).
  - Позволяет фильтровать только **реальные** скидки в наличии (`IN_STOCK` + проверенный `discountPercent >= 30%`).

---

## 2. Что мы делаем (Продуктовое и Архитектурное решение)

Создаем специализированную автоматическую витрину **«🔥 Steals & Archive Sales»** (`/steals` и быстрый фильтр в шапке `Navbar`), которая агрегирует и ранжирует лучшие предложения со всех подключенных магазинов:

1. **Автоматическое вычисление процента скидки (`discountPercent`)**:
   - На основе оригинальной цены (`compareAtPrice`) и текущей цены (`rawPrice`) каждого варианта вычисляется точный процент скидки:
     $$\text{discountPercent} = \text{round}\left(\frac{\text{compareAtPrice} - \text{rawPrice}}{\text{compareAtPrice}} \times 100\right)$$
   - Отсекаются фейковые микро-скидки (`< 15%`), а в раздел **Steals** попадают товары со скидкой от **25–30% и выше**, которые есть в наличии (`availability === "IN_STOCK"` хотя бы в одном размере).
2. **Умное ранжирование «Steal Score»**:
   - Сортировка по умолчанию не просто по дате, а по индексу выгоды (**Steal Score**): комбинация размера скидки (`discountPercent`), свежести снижения цены (`DropEvent` типа `PRICE_DROP`) и наличия ходовых размеров (`S, M, L, XL`).
3. **Специальный UI-режим витрины `/steals`**:
   - Быстрые пресеты глубины скидки: **All Sale (15%+)**, **🔥 Steals (30%+)**, **💎 Heavy Archive (50%+)**, **⚡ Under $50 / 2000 ₴**.
   - Бейджи экономии на карточках: `-45%`, старая перечеркнутая цена, сумма экономии (`Save 1 800 ₴`) и индикатор «Last Size Left!», если в наличии остался только 1 размер.

---

## 3. Где вносятся изменения (Затронутые файлы и модули)

| Файл | Тип изменений | Описание |
| :--- | :--- | :--- |
| `prisma/schema.prisma` | Модификация | Поля `compareAtPrice Decimal? @db.Decimal(10, 2)` и `discountPercent Int? @default(0)` в модели `ProductVariant` + индекс `@@index([discountPercent, availability])`. |
| `src/lib/serverless-ingestor.ts` | Модификация | Парсинг `sv.compare_at_price` из Shopify JSON (`products.json`) и старых цен из Tier-2 экстрактора, автоматический расчет `discountPercent` при сохранении варианта. |
| `src/lib/steals.ts` | **Новый файл** | Утилиты вычисления `discountPercent`, `stealScore`, определения статуса `isLastSizeLeft` и фильтрации товаров для витрины скидок. |
| `src/app/steals/page.tsx` | **Новый файл** | Серверная страница витрины «🔥 Steals & Archive Sales» с пресетами скидок (`minDiscount`: 20%, 30%, 50%), фильтром по размеру и сортировкой по максимальной выгоде. |
| `src/components/steals/steals-hero.tsx` | **Новый файл** | Верхний баннер раздела со статистикой живых скидок (количество брендов на сейле, максимальная скидка дня, быстрые чипсы `-30%`, `-50%`, `Under $50`). |
| `src/components/Navbar.tsx` | Модификация | Добавление навигационной вкладки **🔥 Steals** с бейджем количества горячих скидок. |
| `src/lib/i18n.ts` | Модификация | Переводы (`uk` / `en`) для раздела `Steals & Archive Sales`, чипсов скидок и бейджей «Останній розмір / Last Size». |

---

## 4. Как именно реализовать (Детальная техническая спецификация)

### 4.1. Извлечение `compareAtPrice` и расчет `discountPercent` при инжесте (`src/lib/serverless-ingestor.ts`)

В Shopify фиде `/products.json` каждый объект варианта `sv` содержит поле `compare_at_price` (строка или `null`):
```ts
const rawPrice = parseFloat(sv.price);
const rawCompareAt = sv.compare_at_price ? parseFloat(sv.compare_at_price) : null;

const compareAtPrice =
  rawCompareAt && !isNaN(rawCompareAt) && rawCompareAt > rawPrice
    ? rawCompareAt
    : null;

const discountPercent = compareAtPrice
  ? Math.round(((compareAtPrice - rawPrice) / compareAtPrice) * 100)
  : 0;
```
Эти значения записываются в `ProductVariant` при `upsert`. Для быстрой выборки на странице `/steals` в PostgreSQL создается составной индекс:
```sql
CREATE INDEX IF NOT EXISTS "ProductVariant_discount_avail_idx"
ON "ProductVariant" ("discountPercent" DESC, "availability");
```

### 4.2. Формула расчета `Steal Score` (`src/lib/steals.ts`)

Чтобы наверх витрины попадали действительно лучшие вещи, а не просто вечно висящие аксессуары с одним размером `XXS`, вводим функцию оценки привлекательности лота:

```ts
export interface StealMetrics {
  maxDiscountPercent: number;
  lowestSalePrice: number;
  originalPrice: number;
  savingsAmount: number;
  inStockSizes: string[];
  isLastSize: boolean;
  stealScore: number;
}

export function computeProductStealMetrics(product: any): StealMetrics | null {
  const inStockDiscounted = (product.variants || []).filter(
    (v: any) =>
      v.availability === "IN_STOCK" &&
      Number(v.compareAtPrice || 0) > Number(v.rawPrice || 0)
  );

  if (inStockDiscounted.length === 0) return null;

  let bestVariant = inStockDiscounted[0];
  let maxDiscountPercent = 0;

  for (const v of inStockDiscounted) {
    const raw = Number(v.rawPrice);
    const compare = Number(v.compareAtPrice);
    const pct = Math.round(((compare - raw) / compare) * 100);
    if (pct > maxDiscountPercent) {
      maxDiscountPercent = pct;
      bestVariant = v;
    }
  }

  const inStockSizes = Array.from(
    new Set<string>(
      (product.variants || [])
        .filter((v: any) => v.availability === "IN_STOCK")
        .map((v: any) => v.size)
    )
  );

  // Бонус за ходовые размеры (M, L, XL) и свежесть
  const popularSizeBonus = inStockSizes.some((s) => ["M", "L", "XL"].includes(s.toUpperCase()))
    ? 15
    : 0;

  const stealScore = maxDiscountPercent * 1.5 + popularSizeBonus;

  return {
    maxDiscountPercent,
    lowestSalePrice: Number(bestVariant.rawPrice),
    originalPrice: Number(bestVariant.compareAtPrice),
    savingsAmount: Number(bestVariant.compareAtPrice) - Number(bestVariant.rawPrice),
    inStockSizes,
    isLastSize: inStockSizes.length === 1,
    stealScore,
  };
}
```

### 4.3. Серверная страница `src/app/steals/page.tsx`

1. Поддерживаемые URL Search Params:
   - `minDiscount`: `15` | `30` (по умолчанию) | `50` | `70`
   - `size`: фильтр по конкретному размеру в наличии (`S`, `M`, `L`, `XL`)
   - `category`: категория одежды
   - `brand`: конкретный бренд
   - `maxPrice`: максимальная цена в USD
   - `sortBy`: `steal_score` (по умолчанию) | `discount_desc` | `price_asc` | `newest_drops`
2. Запрос к Prisma выбирает только те товары, у которых есть хотя бы один вариант `IN_STOCK` со скидкой не ниже `minDiscount`:
   ```ts
   const products = await prisma.product.findMany({
     where: {
       variants: {
         some: {
           availability: "IN_STOCK",
           discountPercent: { gte: minDiscount },
           ...(selectedSize ? { size: selectedSize } : {}),
         },
       },
     },
     include: { brand: true, variants: true },
   });
   ```
3. Если в базе временно нет товаров с `discountPercent >= 30` (например, бренды еще не синхронизировали `compareAtPrice`), страница автоматически ослабляет порог до `minDiscount = 1` или предлагает запустить синхронизацию магазинов, чтобы подтянуть актуальные сейлы.

### 4.4. Визуальные акценты на карточке в режиме Steals
- В левом верхнем углу карточки выводится неоново-оранжевый/красный бейдж **`🔥 -45% STEAL`**.
- Если `isLastSize === true`, выводится плашка **`⚡ LAST SIZE: L`**.
- В блоке цены выводится:
  - Новая цена крупным шрифтом (`3 200 ₴`).
  - Старая цена перечеркнутой (`5 800 ₴`).
  - Бейдж чистой выгоды (`Економія 2 600 ₴`).

---

## 5. Критерии приемки (Definition of Done)

- [ ] Инжестор корректно сохраняет `compareAtPrice` и рассчитывает `discountPercent` для вариантов товара.
- [ ] Доступна страница `/steals` и пункт меню **🔥 Steals** в `Navbar`.
- [ ] Работают быстрые пресеты глубины скидки (`All Sale 15%+`, `Steals 30%+`, `Archive 50%+`, `Under $50`).
- [ ] В раздел попадают только товары, реально доступные к покупке (`IN_STOCK`), а при фильтрации по размеру `L` проверяется наличие именно размера `L` со скидкой.
