# Задача №8: Публичные вишлисты и кураторские подборки («Curated Packs / Lookbooks» по ссылке)

## 1. Почему это нужно (Бизнес-ценность и Проблема)

Сейчас избранное (`Favorites`) в DropAgg (`src/lib/favorites.ts`) хранится исключительно в `localStorage` браузера (`dropagg_favorites`) как массив ID товаров:
- **Проблема пользователя**:
  1. Если пользователь собрал крутой вишлист или готовый образ (лукбук из худи, карго-штанов и куртки разных брендов), он **не может отправить ссылку** друзьям, девушке/парню (на день рождения/праздники) или подписчикам в Telegram/Instagram/TikTok.
  2. При заходе с телефона вишлист, собранный на ноутбуке, пуст.
- **Проблема бизнеса (Виральный рост / Organic Acquisition)**:
  - Fashion-инфлюенсеры, стилисты и админы стритвир-пабликов в Telegram и TikTok постоянно делают подборки («Топ-5 черных пуховиков от украинских брендов на зиму», «Gorpcore Starter Pack до $300»).
  - Если дать им инструмент создания брендированной страницы подборки (`dropagg.com/packs/winter-gorpcore-2026`) с живым статусом размеров (`IN_STOCK` / `SOLD OUT`), актуальными ценами и автоматической генерацией OpenGraph-превью (коллаж из 4 вещей), **каждый шеринг такой подборки бесплатно приводит сотни новых целевых пользователей в агрегатор**.

---

## 2. Что мы делаем (Продуктовое и Архитектурное решение)

Превращаем локальное избранное в полноценную систему **Публичных вишлистов и Кураторских подборок (`Curated Packs / Lookbooks`)**:

1. **Два способа шеринга (Zero-Friction + Персистентные паки в БД)**:
   - **Мгновенный шеринг текущего избранного в 1 клик**: Кнопка «🔗 Поделиться вишлистом» в режиме `Favorites` сохраняет снапшот выбранных товаров в БД и генерирует короткую красивую ссылку `/packs/[slug]` (плюс резервный stateless URL `/packs/share?ids=id1,id2...` на случай офлайн-режима).
   - **Именованные кураторские подборки (`CuratedPack`)**: Пользователь или стилист может создать тематический пак с названием (например, *«Kyiv Techwear Pack FW26»*), описанием, тегами стиля (`Gorpcore`, `Archive`, `Streetwear`), заметкой к каждой вещи (например, *«Беру размер L под оверсайз»*) и общей стоимостью полного лука (`Total Fit Price`).
2. **Динамическое OpenGraph-превью (`opengraph-image.tsx`)**:
   - Когда ссылку `/packs/[slug]` отправляют в Telegram, Discord, iMessage или Twitter/X, автоматически рендерится стильная карточка-коллаж с фотографиями вещей, названием пака, именем автора и общей суммой лука.
3. **Интерактивные функции на странице пака (`/packs/[slug]`)**:
   - Живой индикатор наличия размеров по каждой вещи из пака (данные тянутся из актуальной базы `ProductVariant`).
   - Кнопка **«❤️ Сохранить весь пак к себе»** или сохранение отдельных вещей.
   - Калькулятор **«Total Look Cost»** (сколько стоит собрать весь образ прямо сейчас с учетом текущих скидок).

---

## 3. Где вносятся изменения (Затронутые файлы и модули)

| Файл | Тип изменений | Описание |
| :--- | :--- | :--- |
| `prisma/schema.prisma` | Модификация | Добавление моделей `CuratedPack` и `CuratedPackItem` со связями к `User` и `Product`. |
| `src/lib/db-init.ts` | Модификация | SQL-инициализация таблиц `"CuratedPack"` и `"CuratedPackItem"`. |
| `src/app/api/packs/route.ts` | **Новый файл** | API (`GET`, `POST`) для получения списка публичных/личных паков и создания новой подборки из списка `productIds`. |
| `src/app/api/packs/[slug]/route.ts` | **Новый файл** | API (`GET`, `PATCH`, `DELETE`) для получения, редактирования названия/состава пака и инкремента счетчика просмотров/клонирований. |
| `src/app/packs/page.tsx` | **Новый файл** | Витрина комьюнити-лукбуков и кураторских подборок («Community Lookbooks & Curated Packs»). |
| `src/app/packs/[slug]/page.tsx` | **Новый файл** | Публичная страница конкретной подборки / вишлиста с расчетом `Total Look Price`, живыми размерами и кнопкой `Copy Share Link`. |
| `src/app/packs/[slug]/opengraph-image.tsx` | **Новый файл** | Генератор динамического OG-изображения (`next/og` `ImageResponse`) с сеткой из 4 фото товаров подборки для красивого превью в Telegram. |
| `src/components/packs/create-pack-modal.tsx` | **Новый файл** | Модальное окно создания/шеринга вишлиста или лукбука прямо из панели избранного (`Favorites`). |
| `src/components/Navbar.tsx` | Модификация | Ссылка на раздел `/packs` («Подборки / Packs») и кнопка быстрого шеринга, когда активен фильтр `favorites=true`. |

---

## 4. Как именно реализовать (Детальная техническая спецификация)

### 4.1. Схема базы данных (`prisma/schema.prisma`)

```prisma
model CuratedPack {
  id          String            @id @default(uuid())
  slug        String            @unique // Например: "kyiv-gorpcore-fw26-a8f2"
  title       String
  description String?
  authorName  String            @default("Anonymous Curator")
  userId      String?
  styleTags   String[]          // ["Gorpcore", "Techwear", "Winter"]
  isPublic    Boolean           @default(true)
  isFeatured  Boolean           @default(false) // Кураторский выбор редакции
  viewsCount  Int               @default(0)
  likesCount  Int               @default(0)
  createdAt   DateTime          @default(now())
  updatedAt   DateTime          @updatedAt

  user        User?             @relation(fields: [userId], references: [id], onDelete: SetNull)
  items       CuratedPackItem[]

  @@index([isPublic, isFeatured, createdAt])
}

model CuratedPackItem {
  id            String      @id @default(uuid())
  packId        String
  productId     String
  preferredSize String?     // Желаемый размер автора вишлиста (например, "L")
  curatorNote   String?     // Комментарий куратора к вещи
  position      Int         @default(0)
  createdAt     DateTime    @default(now())

  pack          CuratedPack @relation(fields: [packId], references: [id], onDelete: Cascade)
  product       Product     @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@unique([packId, productId])
}
```

### 4.2. Генерация уникального `slug` и создание пака (`POST /api/packs`)

1. Пользователь нажимает **«Поделиться вишлистом / Создать Пак»**, вводит название (например, `Winter Techwear Set`), свое имя/никнейм в Telegram (`@denys_fits`) и выбирает товары (по умолчанию предзаполняются все товары из `getLocalFavorites()`).
2. Бэкенд транслитерирует заголовок и добавляет 4-символьный хеш:
   ```ts
   function generatePackSlug(title: string): string {
     const clean = title
       .toLowerCase()
       .replace(/[^a-z0-9]+/g, "-")
       .replace(/^-|-$/g, "")
       .slice(0, 40) || "wishlist";
     const suffix = Math.random().toString(36).substring(2, 6);
     return `${clean}-${suffix}`;
   }
   ```
3. В одной транзакции создаются `CuratedPack` и записи `CuratedPackItem`, возвращается URL: `${origin}/packs/${pack.slug}`.

### 4.3. Публичная страница подборки `src/app/packs/[slug]/page.tsx`

На сервере загружается подборка вместе с актуальными товарами, брендами и вариантами:
```ts
const pack = await prisma.curatedPack.findUnique({
  where: { slug },
  include: {
    items: {
      orderBy: { position: "asc" },
      include: {
        product: {
          include: { brand: true, variants: true },
        },
      },
    },
  },
});
```
На странице рассчитывается сводная аналитика лука:
- **Total Fit Price**: Сумма цен всех вещей в подборке (в выбранной валюте `UAH / USD / EUR`).
- **In-Stock Ratio**: Сколько вещей из подборки сейчас доступны к покупке (например, `5 / 6 items in stock`), а также подсветка желаемого размера `preferredSize` автора (например, `Size L: IN STOCK 🟢`).
- **Кнопка «Buy Full Look / Open All Stores»** и индивидуальные ссылки с UTM-меткой `?utm_source=dropagg&utm_medium=curated_pack&utm_campaign=${pack.slug}`.

### 4.4. Динамическая генерация превью для соцсетей (`src/app/packs/[slug]/opengraph-image.tsx`)

Используем встроенный в Next.js `ImageResponse` (`next/og`):
- Размер `1200x630`.
- Темный градиентный фон `#09090b`, логотип `DROPAGG.`, название подборки, теги стиля, плашка `6 ITEMS • TOTAL FIT: $420`, и сетка из первых 4 изображений товаров (`product.mainImage`).
- При отправке ссылки в Telegram или Instagram Direct получатель сразу видит визуальный мудборд подборки.

---

## 5. Критерии приемки (Definition of Done)

- [ ] Пользователь может в 2 клика превратить свои сохраненные `Favorites` в публичную ссылку `/packs/[slug]`.
- [ ] На странице `/packs/[slug]` отображаются актуальные цены, наличие размеров (с подсветкой `preferredSize` для подарков/вишлистов), общая стоимость комплекта (`Total Look Cost`) и кнопка копирования ссылки.
- [ ] На странице `/packs` отображаются публичные и редакторские подборки (`Featured Lookbooks`).
- [ ] Работает генерация метаданных и OpenGraph-превью для красивого шеринга в Telegram.
