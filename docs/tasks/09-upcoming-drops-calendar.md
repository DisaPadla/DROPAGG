# Задача №9: Календарь предстоящих релизов (Drop Radar & Cop/Drop голосование с таймером)

## 1. Почему это нужно (Бизнес-ценность и Проблема)

Сейчас агрегатор фиксирует дропы **постфактум** — только тогда, когда товары уже опубликованы в `/products.json` или каталоге магазина:
- **Проблема пользователя**: Культура стритвира строится вокруг **ожидания релиза** (пятничные дропы, сезонные капсулы FW/SS, лимитированные коллаборации). Покупатели хотят знать заранее, *когда* выйдет новая капсула Riot Division, Syndicate или Kith, посмотреть тизер-лукбук и поставить напоминание за 10 минут до старта продаж.
- **Проблема бизнеса (Daily Active Users & Hype Metrics)**:
  1. Календарь предстоящих релизов (**Upcoming Drops Calendar**) превращает DropAgg из простого поисковика товаров в ежедневное медиа-пространство, куда заходят проверить таймеры обратного отсчета.
  2. Механика голосования **🔥 COP (Куплю) vs 🧊 DROP (Пропущу)** создает геймификацию и формирует рейтинг хайпа (`Hype Score`), который:
     - Показывает пользователям самые ожидаемые релизы недели.
     - Дает брендам бесценную аналитику предрелизного спроса (сколько человек нажали `COP` и поставили напоминание еще до старта продаж).

---

## 2. Что мы делаем (Продуктовое и Архитектурное решение)

Создаем интерактивный раздел **«📅 Drop Calendar & Hype Radar»** (`/calendar`):

1. **Карточки предстоящих релизов (`UpcomingDrop`)**:
   - Содержат бренд (`Brand`), название капсулы/айтема, дату и точное время релиза (`releaseAt`), галерею тизер-фотографий (`coverImage`, `lookbookImages`), ориентировочный прайс-рейндж и ссылку на страницу дропа.
   - Автоматическое и ручное пополнение:
     - Бренды или модераторы могут добавлять анонсы через форму `/calendar/submit` (или B2B-кабинет).
     - Парсер автоматически переводит релиз из статуса `SCHEDULED` в `LIVE NOW 🔴`, когда наступает `releaseAt` или когда в инжесторе появляются соответствующие товары бренда.
2. **Живой таймер обратного отсчета (`CountdownTimer`)**:
   - Отображает `02d : 14h : 35m : 12s` до старта дропа.
   - В последние 60 минут перед дропом карточка подсвечивается пульсирующим неоновым бейджем `⚡ DROPPING SOON`.
3. **Голосование `🔥 COP` vs `🧊 DROP` и индекс хайпа (`Hype Meter`)**:
   - Каждый пользователь (по `userId` или fingerprint/cookie) может проголосовать `COP` или `DROP` на карточке предстоящего релиза.
   - На карточке в реальном времени отображается полоса соотношения голосов (например, **`🔥 88% COP (142 votes)`**) и сортировка календаря по `Most Hyped` vs `Dropping Soonest`.
4. **Кнопка «🔔 Remind Me 10m Before Drop»**:
   - Интегрируется с системой уведомлений (Задача №6) и возможностью добавить событие в Google Calendar / Apple Calendar (`.ics` генератор).

---

## 3. Где вносятся изменения (Затронутые файлы и модули)

| Файл | Тип изменений | Описание |
| :--- | :--- | :--- |
| `prisma/schema.prisma` | Модификация | Добавление моделей `UpcomingDrop`, `DropVote` (`COP` \| `DROP`) и `DropReminder`. |
| `src/lib/db-init.ts` | Модификация | SQL-инициализация таблиц `"UpcomingDrop"`, `"DropVote"`, `"DropReminder"`. |
| `src/app/api/calendar/route.ts` | **Новый файл** | API (`GET`, `POST`) для получения списка предстоящих релизов и добавления нового анонса дропа. |
| `src/app/api/calendar/[id]/vote/route.ts` | **Новый файл** | API (`POST`) для голосования `COP` / `DROP` с защитой от накрутки (уникальный ключ по `userId` или `voterKey`) и пересчетом `copCount` / `dropCount`. |
| `src/app/api/calendar/[id]/ics/route.ts` | **Новый файл** | Генератор `.ics` файла календаря для добавления напоминания о дропе в iOS / Google Calendar в 1 клик. |
| `src/app/calendar/page.tsx` | **Новый файл** | Страница календаря релизов с группировкой по неделям (`This Week`, `Next Week`, `Recently Dropped`) и сортировкой по `Hype Score`. |
| `src/components/calendar/drop-card.tsx` | **Новый файл** | Карточка релиза с живым таймером (`Countdown`), прогресс-баром `🔥 COP vs 🧊 DROP` и кнопками `Remind Me` / `.ics`. |
| `src/components/Navbar.tsx` | Модификация | Добавление ссылки **📅 Calendar** в основную навигацию. |
| `src/lib/i18n.ts` | Модификация | Локализация (`uk` / `en`) для календаря релизов, таймера и голосования `Cop / Drop`. |

---

## 4. Как именно реализовать (Детальная техническая спецификация)

### 4.1. Схема базы данных (`prisma/schema.prisma`)

```prisma
enum DropLifecycleStatus {
  SCHEDULED
  LIVE
  SOLD_OUT
  ARCHIVED
}

enum VoteChoice {
  COP
  DROP
}

model UpcomingDrop {
  id             String              @id @default(uuid())
  brandId        String?
  brandName      String              // Позволяет анонсировать дроп даже до подключения фида бренда
  title          String
  description    String?
  coverImage     String
  lookbookImages String[]
  targetUrl      String
  releaseAt      DateTime
  estimatedPrice String?             // Например: "2 500 - 6 800 ₴"
  status         DropLifecycleStatus @default(SCHEDULED)
  isPromoted     Boolean             @default(false) // Интеграция с B2B-продвижением (Задача №10)
  copCount       Int                 @default(0)
  dropCount      Int                 @default(0)
  remindersCount Int                 @default(0)
  createdAt      DateTime            @default(now())
  updatedAt      DateTime            @updatedAt

  brand          Brand?              @relation(fields: [brandId], references: [id], onDelete: SetNull)
  votes          DropVote[]

  @@index([releaseAt, status])
}

model DropVote {
  id             String       @id @default(uuid())
  upcomingDropId String
  voterKey       String       // userId или анонимный clientId из cookie
  choice         VoteChoice
  createdAt      DateTime     @default(now())

  upcomingDrop   UpcomingDrop @relation(fields: [upcomingDropId], references: [id], onDelete: Cascade)

  @@unique([upcomingDropId, voterKey])
}
```

### 4.2. Логика голосования `COP / DROP` (`src/app/api/calendar/[id]/vote/route.ts`)

1. При клике на кнопку **🔥 COP** или **🧊 DROP** отправляется `POST /api/calendar/[id]/vote` с `{ choice: "COP" | "DROP" }`.
2. Определяется `voterKey`: ID текущего пользователя из `getCurrentUser()` либо подписанный `voter_id` из cookie.
3. В транзакции Prisma:
   - Выполняется `upsert` в `DropVote` по `upcomingDropId_voterKey`.
   - Пересчитываются агрегаты `copCount` и `dropCount` для `UpcomingDrop`, чтобы чтение списка дропов не требовало `COUNT(*)` на каждый запрос.
   - Вычисляется рейтинг хайпа:
     $$\text{hypeRatio} = \frac{\text{copCount}}{\max(1, \text{copCount} + \text{dropCount})} \times 100\%$$
     $$\text{hypeScore} = \text{copCount} \times 2 - \text{dropCount} + \text{remindersCount} \times 3$$

### 4.3. Компонент живого таймера (`src/components/calendar/drop-card.tsx`)

- Использует клиентский `useEffect` с `setInterval(..., 1000)`, вычисляющий разницу `releaseAt.getTime() - Date.now()`.
- Состояния карточки:
  1. `diff > 24h`: Спокойный бейдж с датой и временем (`ПТ, 24 ОКТ • 19:00`) + обратный отсчет.
  2. `0 < diff <= 24h`: Оранжевый пульсирующий таймер `⚡ DROPPING IN 04:12:59`.
  3. `diff <= 0`: Бейдж меняется на `🔴 LIVE NOW — SHOP DROP`, а основная кнопка превращается из `🔔 Remind Me` в `🛒 Перейти к дропу`.

### 4.4. Генерация `.ics` файла (`src/app/api/calendar/[id]/ics/route.ts`)

Чтобы пользователь мог добавить релиз в нативный календарь iPhone или Google Calendar без регистрации:
- Роут возвращает `Content-Type: text/calendar; charset=utf-8` с `BEGIN:VCALENDAR` / `BEGIN:VEVENT`, `DTSTART` за 10 минут до `releaseAt`, `VALARM` уведомлением и прямой ссылкой на магазин с `utm_source=dropagg&utm_medium=calendar_ics`.

---

## 5. Критерии приемки (Definition of Done)

- [ ] Страница `/calendar` отображает предстоящие и недавно вышедшие релизы с фильтрацией `Upcoming`, `Most Hyped 🔥` и `Just Dropped 🔴`.
- [ ] На каждой карточке работает посекундный таймер обратного отсчета до `releaseAt`.
- [ ] Пользователи могут голосовать `🔥 COP` / `🧊 DROP` с мгновенным (optimistic) обновлением счетчиков и полосы процента хайпа.
- [ ] Доступна кнопка скачивания `.ics` события в календарь и форма добавления нового анонса релиза.
