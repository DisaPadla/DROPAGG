# Задача №1: Разделение каталога на два слоя — «Explore (Глобальный каталог)» и «My Radar (Персональная лента)»

## 1. Почему это нужно (Проблема и Бизнес-обоснование)

В текущей реализации **DropAgg** застрял между двумя конфликтующими продуктовыми концепциями: **«Персональный воркспейс»** и **«Глобальный агрегатор»**:

1. **Игнорирование связки `UserBrand` в основном потоке**:
   - В `prisma/schema.prisma` и `src/lib/db-init.ts` уже созданы таблицы `User` и `UserBrand` (`@@unique([userId, brandId])`), а в `src/lib/session.ts` реализована функция `getCurrentUser()`.
   - Однако главная страница каталога (`src/app/page.tsx`) и страница брендов (`src/app/brands/page.tsx`) запрашивают `prisma.brand.findMany()` и `prisma.product.findMany()` **без фильтрации по пользователю**. Все пользователи видят одну и ту же свалку брендов.
2. **Деструктивное удаление брендов (`DELETE /api/brands/[id]`)**:
   - В `src/app/api/brands/[id]/route.ts` вызов `DELETE` выполняет `prisma.brand.delete({ where: { id } })`.
   - Из-за `onDelete: Cascade` в схеме БД, если один пользователь решает убрать бренд из своего списка, **этот бренд и все его товары физически удаляются из базы для всех остальных пользователей платформы**.
3. **Отсутствие привязки при добавлении магазина (`POST /api/brands/suggest`)**:
   - Когда пользователь добавляет магазин через `AddBrandModal` или `WelcomeScreen`, роут `/api/brands/suggest` создает запись в таблице `Brand`, но **не создает запись в `UserBrand`**. Если бренд уже был в базе, API просто отвечает `"Store X is already in your workspace!"`, даже если у текущего пользователя его нет.
4. **Проблема холодного старта (Cold Start) vs Персонализация**:
   - Новому пользователю важно сразу увидеть живую витрину дропів (**Explore**), чтобы понять ценность агрегатора за 3 секунды, но при этом иметь собственную ленту любимых брендов (**My Radar**), не замусоренную чужими тестовыми магазинами.

---

## 2. Что мы делаем (Продуктовое и Архитектурное решение)

Мы разделяем каталог и управление брендами на **два независимых, но связанных слоя**:

1. **🌐 Explore (Глобальный каталог)**:
   - Отображает дропы всех активных брендов платформы (`?feed=explore` или по умолчанию `/`).
   - Позволяет новым пользователям сразу искать худи, куртки, штаны и открывать для себя локальные и мировые стритвир-бренды без пустого экрана.
2. **📡 My Radar (Персональная лента пользователя)**:
   - Отображает дропы и бренды, на которые подписан текущий пользователь через таблицу `UserBrand` (`?feed=radar`).
   - Боковой фильтр брендов (`CatalogFilters`) в режиме `My Radar` показывает только бренды из радара пользователя.
   - Если у пользователя в `My Radar` еще нет отслеживаемых брендов, выводится персональный пустой стейт с возможностью в 1 клик подписаться на популярные бренды из глобального каталога или добавить свой URL.
3. **Безопасная подписка / отписка (`UserBrand`) вместо глобального `DELETE`**:
   - Добавление бренда через `/api/brands/suggest` автоматически привязывает бренд к текущему пользователю (`UserBrand.upsert`).
   - В каталоге брендов (`/brands`) каждый бренд имеет статус `isTracked` (в радаре пользователя или нет) и кнопку быстрого переключения **«В Радаре ✓ / + В Радар»**.
   - Удаление бренда пользователем (`DELETE /api/brands/[id]`) удаляет только связь `UserBrand` для текущего `userId`, сохраняя сам бренд и его историю товаров в глобальной базе для остальных пользователей.

---

## 3. Где вносятся изменения (Затронутые файлы)

| Файл | Тип изменений | Описание |
| :--- | :--- | :--- |
| `src/app/api/user-brands/route.ts` | **Новый файл** | API-хендлер (`GET`, `POST`, `DELETE`) для получения списка `UserBrand` текущего пользователя, подписки (`follow`) и отписки (`unfollow`) от бренда. |
| `src/app/api/brands/suggest/route.ts` | Модификация | Получение `currentUser` через `getCurrentUser()` и автоматический `upsert` записи в `UserBrand` при создании нового или повторном добавлении существующего бренда. |
| `src/app/api/brands/[id]/route.ts` | Модификация | Замена глобального `prisma.brand.delete` на безопасное удаление связи `prisma.userBrand.deleteMany({ where: { userId, brandId } })`. Глобальное удаление оставлено только при явном флаге `?hard=true` и отсутствии других подписчиков. |
| `src/components/catalog/feed-tabs.tsx` | **Новый файл** | Клиентский компонент переключения режима ленты: **Explore (Усі бренди)** vs **My Radar (Мій Радар)** со счетчиком отслеживаемых магазинов и пустым стейтом радара. |
| `src/app/page.tsx` | Модификация | Поддержка параметра `feed` (`explore` \| `radar`), загрузка `currentUser` и его `userBrands`, фильтрация товаров и списка доступных брендов по `UserBrand` в режиме `radar`. |
| `src/components/catalog/pglite-catalog-view.tsx` | Модификация | Строгая изоляция PGlite WASM (`idb://dropagg-db`) и клиентской выдачи по `availableBrands` (`effectiveBrands`), чтобы закешированные в IndexedDB товары из `Explore` не попадали в `My Radar`. |
| `src/components/catalog/catalog-filters.tsx` | Модификация | Отображение активных брендов из URL и фильтрация пустых токенов `brands` / `categories`. |
| `src/components/layout/user-switcher.tsx` | Модификация | Автоматический сброс фильтра `brands` при переключении профиля в режиме `My Radar` (`?feed=radar`). |
| `src/components/brands/add-brand-modal.tsx` | Модификация | Сохранение контекста `/?feed=radar` или `/brands` после добавления нового магазина вместо безусловного редиректа на `/`. |
| `src/app/brands/page.tsx` | Модификация | Загрузка `currentUser` и списка `userBrands` пользователя, передача флага `isTracked` и количества подписчиков (`_count.userBrands`) в `BrandsList`. |
| `src/components/brands/brands-list.tsx` | Модификация | Фильтрация брендов на вкладки «Все магазины (Explore)» и «Мой Радар (Tracked)», кнопка подписки/отписки в 1 клик, безопасное удаление из персонального радара + `router.refresh()`. |
| `src/components/Navbar.tsx` | Модификация | Добавление быстрого линка/индикатора `My Radar` и интеграция переключателя профилей (`UserSwitcher`) для демонстрации персональных воркспейсов. |
| `src/lib/i18n.ts` | Модификация | Добавление ключей локализации (`uk` / `en`) для `Explore`, `My Radar`, кнопок отслеживания брендов и пустых состояний. |

---

## 4. Как именно реализовать (Детальная техническая спецификация)

### 4.1. Схема данных и работа с `UserBrand`
В `prisma/schema.prisma` модель `UserBrand` уже определена:
```prisma
model UserBrand {
  id        String   @id @default(uuid())
  userId    String
  brandId   String
  createdAt DateTime @default(now())

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  brand     Brand    @relation(fields: [brandId], references: [id], onDelete: Cascade)

  @@unique([userId, brandId])
}
```
Никаких разрушающих миграций схемы не требуется — таблица также гарантированно создается в `ensureTablesExist()` (`src/lib/db-init.ts`).

### 4.2. Новый API-маршрут `src/app/api/user-brands/route.ts`
Реализует управление персональным радаром пользователя:
- **`GET /api/user-brands`**:
  1. Вызывает `const user = await getCurrentUser()`.
  2. Возвращает список `brandIds`, находящихся в `UserBrand` для `user.id`, и информацию о текущем пользователе.
- **`POST /api/user-brands`**:
  1. Принимает `{ brandId: string }`.
  2. Выполняет `prisma.userBrand.upsert`:
     ```ts
     const record = await prisma.userBrand.upsert({
       where: {
         userId_brandId: { userId: user.id, brandId },
       },
       update: {},
       create: { userId: user.id, brandId },
     });
     ```
  3. Возвращает `{ success: true, tracked: true, userBrand: record }`.
- **`DELETE /api/user-brands`**:
  1. Принимает `{ brandId: string }` (из body или query `?brandId=...`).
  2. Выполняет `prisma.userBrand.deleteMany({ where: { userId: user.id, brandId } })`.
  3. Возвращает `{ success: true, tracked: false }`.

### 4.3. Обновление `POST /api/brands/suggest` (`src/app/api/brands/suggest/route.ts`)
1. После получения или создания записи `brand`:
   ```ts
   const currentUser = await getCurrentUser();
   await prisma.userBrand.upsert({
     where: {
       userId_brandId: {
         userId: currentUser.id,
         brandId: brand.id,
       },
     },
     update: {},
     create: {
       userId: currentUser.id,
       brandId: brand.id,
     },
   });
   ```
2. Если бренд уже существовал в глобальной базе, он мгновенно привязывается к радару текущего пользователя без дублирования `Brand`, а сообщение уточняет, что магазин добавлен в персональный радар (`My Radar`).

### 4.4. Безопасное удаление в `DELETE /api/brands/[id]` (`src/app/api/brands/[id]/route.ts`)
1. Вместо безусловного `prisma.brand.delete({ where: { id } })`:
   - Получаем `currentUser = await getCurrentUser()`.
   - Удаляем привязку `UserBrand` для текущего пользователя:
     ```ts
     await prisma.userBrand.deleteMany({
       where: { userId: currentUser.id, brandId: id },
     });
     ```
   - Если передан параметр `?hard=true` и у бренда больше нет подписчиков (`count === 0`), допускается физическое удаление `Brand`. В стандартном пользовательском сценарии бренд остается в глобальном каталоге `Explore`, но исчезает из `My Radar` пользователя.

### 4.5. Двухслойный каталог в `src/app/page.tsx` и `src/components/catalog/feed-tabs.tsx`
1. `HomePageProps.searchParams` расширяется параметром `feed?: string` (`"explore"` | `"radar"`).
2. На сервере в `src/app/page.tsx`:
   - Загружается `currentUser = await getCurrentUser()`.
   - Запрашиваются `userBrands` пользователя:
     ```ts
     const userBrandRows = await prisma.userBrand.findMany({
       where: { userId: currentUser.id },
       include: { brand: { select: { id: true, name: true } } },
     });
     ```
   - Вычисляется массив `radarBrandNames` и `radarBrandIds`.
   - В режиме `feed === "radar"`:
     - Список доступных брендов в сайдбаре (`availableBrands`) ограничивается `radarBrandNames`.
     - В `where` запрос товаров `prisma.product.findMany` добавляется условие `brandId: { in: radarBrandIds }` (с учетом выбранных пользователем `brandFilters`).
     - Если `radarBrandIds.length === 0`, вместо глобального `WelcomeScreen` рендерится блок пустого радара с предложением подписаться на существующие бренды из `Explore` в 1 клик или добавить свой магазин.
   - В режиме `feed === "explore"` (по умолчанию):
     - Отображаются все бренды и товары из глобальной базы.

### 4.6. Обновление страницы `/brands` (`src/app/brands/page.tsx` и `src/components/brands/brands-list.tsx`)
1. `src/app/brands/page.tsx` переводится в динамический режим (`export const dynamic = "force-dynamic"`), чтобы учитывать сессию текущего пользователя (`getCurrentUser()`).
2. Для каждого бренда вычисляется:
   - `isTracked`: подписан ли текущий пользователь (`UserBrand`).
   - `_count.products`: число товаров.
   - `_count.userBrands`: сколько пользователей отслеживают этот бренд.
3. В `BrandsList`:
   - Добавляются вкладки фильтрации: **Все магазины (`Explore`)** и **Мой Радар (`My Radar`)**.
   - На каждой карточке бренда добавляется кнопка **«В Радаре ✓» / «+ В Радар»**, вызывающая `/api/user-brands` для мгновенного добавления/удаления бренда из персональной ленты.

---

## 5. Критерии приемки (Definition of Done)

- [x] Переключение между вкладками **Explore** и **My Radar** на главной странице корректно фильтрует товары и список брендов в сайдбаре.
- [x] Переключение пользователя через `UserSwitcher` (например, `Denys` -> `Alex`) изолирует их персональные ленты `My Radar`, при этом сохраняя общий доступ к `Explore`.
- [x] Добавление бренда через модальное окно или страницу `/suggest` автоматически добавляет бренд в `My Radar` текущего пользователя.
- [x] Удаление бренда пользователем в `/brands` убирает его из `My Radar` пользователя, но **не удаляет** бренд и его товары у других пользователей.
- [x] В `/brands` можно в 1 клик подписаться на любой бренд из глобального каталога или отписаться от него.
