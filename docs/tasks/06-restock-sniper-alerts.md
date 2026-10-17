# Задача №6: Снайпер рестоков и скидок в Telegram / Web Push (Freemium & DropAgg PRO)

## 1. Почему это нужно (Бизнес-ценность и Проблема)

В мире стритвира и локальных лимитированных дропов (Riot Division, Syndicate, Katsurina, Kith, Stüssy, Palace) ходовые размеры (`M`, `L`, `XL`) разлетаются за считанные минуты после релиза или возврата товара на склад (restock).
- **Проблема пользователя**: Покупатель не будет заходить на сайт агрегатора каждые 15 минут, чтобы проверить, не вернулся ли его размер `L` в наличие или не упала ли цена на куртку из вишлиста.
- **Проблема бизнеса (Монетизация и Retention)**: Без проактивных триггеров (Push / Telegram) агрегатор зависит от случайного трафика. Уведомления о рестоке конкретного размера или падении цены имеют **CTR 35–60%** и являются главной точкой монетизации по модели **Freemium -> DropAgg PRO**:
  - **Free Tier**: До 3 активных алертов на размер/товар, доставка с задержкой 15 минут или только через браузерный Web Push.
  - **DropAgg PRO ($4.99/мес или 199 ₴/мес)**: Безлимитные снайпер-подписки на конкретные размеры и целые бренды, мгновенные уведомления (Real-Time 0s delay) в Telegram-бот и Web Push при появлении `DropEvent` (`RESTOCK`, `NEW_DROP`, `PRICE_DROP`).

---

## 2. Что мы делаем (Продуктовое и Архитектурное решение)

Создаем **Event-Driven систему снайпер-уведомлений (Restock & Price Drop Sniper)** поверх существующего движка синхронизации (`src/lib/serverless-ingestor.ts` и `src/workers/ingestor-shopify.ts`) и Service Worker (`public/sw.js`):

1. **Подписка на конкретный товар/размер («🔔 Track Size / Price»)**:
   - На карточке товара (и в ховер-меню размеров `OUT_OF_STOCK`) пользователь кликает на перечеркнутый размер (например, `L`) или кнопку колокольчика и выбирает триггер:
     - *«Уведомить, когда размер L появится в наличии»* (`RESTOCK`)
     - *«Уведомить при снижении цены»* (`PRICE_DROP`, опционально ниже целевого порога `targetPrice`)
     - *«Уведомить о любом новом дропе бренда»* (`BRAND_NEW_DROP`)
2. **Два канала доставки (Telegram Bot + Web Push API)**:
   - **Telegram**: Привязка аккаунта через Deep Link (`https://t.me/DropAggSniperBot?start=user_<token>`), сохранение `telegramChatId` у `User`.
   - **Web Push**: Использование уже зарегистрированного `public/sw.js` и стандарта VAPID (`web-push`) для отправки нативных пушей на iOS/Android/Desktop даже при закрытой вкладке.
3. **Мгновенный матчинг при инжесте (`Alert Matcher`)**:
   - Когда `syncBrandChunkServerless` обнаруживает переход `OUT_OF_STOCK -> IN_STOCK` или снижение цены `rawPrice < previousPrice`, он создает `DropEvent` и вызывает диспетчер `dispatchSniperAlerts()`, который находит все активные подписки `AlertSubscription` и отправляет уведомления (с учетом приоритета `PRO` vs `FREE`).

---

## 3. Где вносятся изменения (Затронутые файлы и модули)

| Файл | Тип изменений | Описание |
| :--- | :--- | :--- |
| `prisma/schema.prisma` | Модификация | Расширение модели `User` (`plan`, `telegramChatId`, `telegramLinkToken`) и добавление таблиц `AlertSubscription`, `PushSubscriptionDevice`, `NotificationLog`. |
| `src/lib/db-init.ts` | Модификация | Добавление `CREATE TABLE IF NOT EXISTS` для новых таблиц подписок и уведомлений. |
| `src/lib/alerts/dispatcher.ts` | **Новый файл** | Сервис сопоставления сработавших `DropEvent` с активными `AlertSubscription`, приоритизация `PRO`-пользователей, отправка в Telegram Bot API и Web Push. |
| `src/lib/alerts/telegram.ts` | **Новый файл** | Клиент Telegram Bot API (`sendMessage` с фото товара, ценой, размером и inline-кнопкой `🛒 Купить сейчас` с UTM-меткой). |
| `src/lib/alerts/web-push.ts` | **Новый файл** | Обертка над VAPID Web Push для отправки payload в браузерный Service Worker. |
| `public/sw.js` | Модификация | Обработчики событий `push` и `notificationclick` для показа уведомления и перехода сразу на карточку товара в магазине. |
| `src/app/api/alerts/route.ts` | **Новый файл** | CRUD API (`GET`, `POST`, `DELETE`) для управления снайпер-подписками пользователя (с проверкой лимита Free = 3 подписки vs PRO = ∞). |
| `src/app/api/webhooks/telegram/route.ts` | **Новый файл** | Webhook для Telegram-бота: обработка команды `/start <token>`, привязка `telegramChatId` к `User`, команда `/list` для просмотра активных снайперов. |
| `src/app/api/push/subscribe/route.ts` | **Новый файл** | Сохранение браузерного `PushSubscription` объекта (endpoint, p256dh, auth) в БД. |
| `src/components/alerts/sniper-modal.tsx` | **Новый файл** | Модальное окно настройки алерта при клике на отсутствующий размер или иконку 🔔 на карточке товара, а также статус подключения Telegram / Web Push. |
| `src/components/catalog/pglite-catalog-view.tsx` | Модификация | Добавление кнопки 🔔 и кликабельных `OUT_OF_STOCK` размеров для быстрого создания алерта. |

---

## 4. Как именно реализовать (Детальная техническая спецификация)

### 4.1. Изменения схемы БД (`prisma/schema.prisma`)

```prisma
enum UserPlan {
  FREE
  PRO
}

enum AlertType {
  RESTOCK
  PRICE_DROP
  BRAND_NEW_DROP
}

model User {
  id                 String                   @id @default(uuid())
  email              String                   @unique
  name               String?
  plan               UserPlan                 @default(FREE)
  planExpiresAt      DateTime?
  telegramChatId     String?                  @unique
  telegramUsername   String?
  telegramLinkToken  String?                  @unique
  createdAt          DateTime                 @default(now())
  updatedAt          DateTime                 @updatedAt

  userBrands         UserBrand[]
  alertSubscriptions AlertSubscription[]
  pushDevices        PushSubscriptionDevice[]
}

model AlertSubscription {
  id           String    @id @default(uuid())
  userId       String
  type         AlertType
  productId    String?   // Заполнено для RESTOCK и PRICE_DROP
  brandId      String?   // Заполнено для BRAND_NEW_DROP
  targetSize   String?   // Например, "L" или null (любой размер)
  targetPrice  Decimal?  @db.Decimal(10, 2) // Желаемая цена для PRICE_DROP
  isActive     Boolean   @default(true)
  lastFiredAt  DateTime?
  createdAt    DateTime  @default(now())

  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  product      Product?  @relation(fields: [productId], references: [id], onDelete: Cascade)
  brand        Brand?    @relation(fields: [brandId], references: [id], onDelete: Cascade)

  @@index([productId, targetSize, isActive])
  @@index([brandId, type, isActive])
}

model PushSubscriptionDevice {
  id        String   @id @default(uuid())
  userId    String
  endpoint  String   @unique
  p256dh    String
  auth      String
  userAgent String?
  createdAt DateTime @default(now())

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

### 4.2. Алгоритм детекции и отправки в `src/lib/alerts/dispatcher.ts`

Во время работы `syncBrandChunkServerless` (`src/lib/serverless-ingestor.ts`), перед выполнением `prisma.productVariant.upsert`, мы сравниваем старое состояние варианта из БД с новым из фида магазина:

1. **Детекция Рестока (`RESTOCK`)**:
   - Условие: `existingVariant.availability === "OUT_OF_STOCK" && newAvailability === "IN_STOCK"`.
   - Запрос подписчиков:
     ```ts
     const matchingAlerts = await prisma.alertSubscription.findMany({
       where: {
         isActive: true,
         type: "RESTOCK",
         productId: product.id,
         OR: [{ targetSize: null }, { targetSize: variant.size }],
       },
       include: { user: { include: { pushDevices: true } } },
     });
     ```
2. **Детекция Падения цены (`PRICE_DROP`)**:
   - Условие: `newRawPrice < Number(existingVariant.rawPrice) && newAvailability === "IN_STOCK"`.
   - Запрос подписчиков, у которых `targetPrice === null || targetPrice >= newRawPrice`.
3. **Приоритизация Freemium vs PRO**:
   - Для пользователей с `user.plan === "PRO"` отправка выполняется **немедленно** (`await sendTelegramAlert(...)` + `await sendWebPushAlert(...)`).
   - Для пользователей с `user.plan === "FREE"` при наличии BullMQ задача ставится в очередь с `delay: 15 * 60 * 1000` (15 минут задержки, с предложением в сообщении: *«⚡️ PRO-подписчики получили этот алерт 15 минут назад»*).

### 4.3. Формат сообщения в Telegram (`src/lib/alerts/telegram.ts`)
Вызов `POST https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendPhoto`:
```json
{
  "chat_id": "123456789",
  "photo": "https://cdn.shopify.com/...",
  "caption": "🎯 *RESTOCK DETECTED!*\n\n🏷 *Бренд:* RIOT DIVISION\n👕 *Товар:* Nyco Parka Gen.3 Black\n📏 *Размер в наличии:* `L`\n💰 *Цена:* 6 400 ₴\n\n⚡ _Осталось мало штук, переходи к покупке:_ ",
  "parse_mode": "Markdown",
  "reply_markup": {
    "inline_keyboard": [
      [
        {
          "text": "🛒 Купить на сайте (Размер L)",
          "url": "https://riotdivision.tech/products/nyco-parka?utm_source=dropagg&utm_medium=sniper_bot"
        }
      ],
      [
        {
          "text": "🔕 Отключить снайпер для этого товара",
          "callback_data": "mute_alert:<alertId>"
        }
      ]
    ]
  }
}
```

### 4.4. Привязка Telegram в 1 клик (`src/app/api/webhooks/telegram/route.ts`)
1. В UI (`sniper-modal.tsx`) для текущего пользователя генерируется короткий `telegramLinkToken` (например, `sn_8f92a1b4`) и отображается кнопка:
   `https://t.me/${NEXT_PUBLIC_TELEGRAM_BOT_NAME}?start=${telegramLinkToken}`
2. Когда пользователь нажимает **«Запустить»** в Telegram, Telegram присылает `POST /api/webhooks/telegram` с текстом `/start sn_8f92a1b4`.
3. Webhook находит пользователя по `telegramLinkToken`, записывает `telegramChatId = String(message.chat.id)` и отправляет приветственное сообщение.

### 4.5. Лимиты Freemium и проверка на бэкенде (`src/app/api/alerts/route.ts`)
При создании новой подписки `POST /api/alerts`:
```ts
const activeCount = await prisma.alertSubscription.count({
  where: { userId: user.id, isActive: true },
});

if (user.plan === "FREE" && activeCount >= 3) {
  return NextResponse.json(
    {
      error: "FREE_LIMIT_REACHED",
      message: "На бесплатном тарифе доступно до 3 активных снайперов. Перейдите на DropAgg PRO для безлимитного отслеживания.",
      upgradeRequired: true,
    },
    { status: 403 }
  );
}
```

---

## 5. Критерии приемки (Definition of Done)

- [ ] Пользователь может кликнуть на любой отсутствующий размер (`OUT_OF_STOCK`) на карточке товара и поставить его на отслеживание в 1 клик.
- [ ] Поддерживаются оба канала уведомлений: привязка Telegram-бота через Deep Link и браузерный Web Push через `public/sw.js`.
- [ ] При изменении статуса варианта на `IN_STOCK` или снижении цены во время парсинга подписчикам отправляется карточка с прямой UTM-ссылкой.
- [ ] Работает ограничение Freemium (максимум 3 активных снайпера на `FREE` плане) и upsell-модалка для перехода на `DropAgg PRO`.
