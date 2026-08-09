# 🚀 Инструкция по Деплою DropAgg (Batch CLO)

Подробное пошаговое руководство по развертыванию приложения **DropAgg** в продакшене.

---

## 🏗️ Архитектура системы

Система состоит из следующих сервисов:
1. **Next.js Web App (`web`)**: Фронтенд-каталог (RSC + PGlite WASM Postgres в браузере) и серверные API эндпоинты (`/api/brands/suggest`, `/api/brands/sync-all`, `/api/brands/[id]`).
2. **PostgreSQL (`postgres`)**: Основная реляционная база данных сервера.
3. **Redis (`redis`)**: Сервер очередей BullMQ для фонового парсинга и синхронизации магазинов.
4. **Ingestion Worker (`worker-ingestor`)**: Фоновый воркер (`src/workers/ingestor-shopify.ts`), выполняющий веб-скрейпинг товаров (Shopify REST/GraphQL API, Wix, Tilda, Custom HTML).
5. **Poller Worker (`worker-poller`)**: Фоновый планировщик (`src/workers/poller.ts`), периодически запускающий синхронизацию магазинов.

---

## 🔑 Переменные Окружения (`.env`)

Создайте файл `.env` в корневом каталоге проекта:

```env
# Окружение
NODE_ENV=production
PORT=3000

# Подключение к PostgreSQL
DATABASE_URL="postgresql://postgres:YOUR_POSTGRES_PASSWORD@postgres:5432/batch_clo?schema=public"

# Подключение к Redis (для BullMQ очередей)
REDIS_URL="redis://redis:6379"

# (Опционально) Поисковый движок Meilisearch
MEILISEARCH_HOST="http://meilisearch:7700"
MEILISEARCH_API_KEY="YOUR_SECURE_MEILI_KEY"

# (Опционально) Секретный ключ для крон-запросов
CRON_SECRET="YOUR_RANDOM_CRON_SECRET_KEY"
```

---

## 🚀 Вариант 1: Деплой через Docker Compose на VPS (Рекомендуемый способ)

Этот способ идеально подходит для **DigitalOcean, Hetzner, AWS EC2, Scaleway** ($5–$10/мес). Все сервисы запускаются локально в изоляции на одном сервере.

### Шаг 1: Подготовка сервера (Ubuntu / Debian)
Подключитесь к серверу по SSH и установите Docker:

```bash
# Обновляем пакеты
sudo apt update && sudo apt upgrade -y

# Устанавливаем Docker и Docker Compose
sudo apt install -y docker.io docker-compose-v2 git

# Проверяем установку
docker --version
docker compose version
```

### Шаг 2: Клонирование репозитория
```bash
cd /var/www
git clone https://github.com/YOUR_USERNAME/batch-clo.git
cd batch-clo
```

### Шаг 3: Настройка переменных окружения
Создайте производственный файл `.env`:
```bash
cp .env.example .env
nano .env
```
Замените пароли и ключи на безопасные значения.

### Шаг 4: Сборка и Запуск Контейнеров
Запустите систему в фоновом режиме:
```bash
docker compose up -d --build
```

Проверить статус запущенных сервисов:
```bash
docker compose ps
```

Проверить логи контейнеров:
```bash
# Все логи
docker compose logs -f

# Логи только скрейпера
docker compose logs -f worker-ingestor
```

### Шаг 5: Настройка Nginx Reverse Proxy и SSL (HTTPS)
Для того чтобы сайт открывался по домену с HTTPS (напр. `https://dropagg.com`):

1. Установите Nginx и Certbot:
```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

2. Создайте конфиг Nginx:
```bash
sudo nano /etc/nginx/sites-available/dropagg
```

Вставьте конфигурацию:
```nginx
server {
    server_name dropagg.com www.dropagg.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

3. Активируйте конфиг и выпустіте SSL сертификат:
```bash
sudo ln -s /etc/nginx/sites-available/dropagg /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# SSL бесплатно через Let's Encrypt
sudo certbot --nginx -d dropagg.com -d www.dropagg.com
```

---

## ☁️ Вариант 2: Облачный Деплой (Vercel + Railway / Render / Supabase)

Если вы хотите разместить веб-интерфейс на Vercel, а бэкенд в облаке:

### 1. Веб-приложение (Vercel)
- Задеплойте репозиторий на [Vercel](https://vercel.com).
- Добавьте переменные окружения:
  - `DATABASE_URL`: Строка подключения к PostgreSQL (Supabase / Neon / Railway).
  - `REDIS_URL`: Строка подключения к Redis (Upstash / Railway).

### 2. База Данных PostgreSQL
- Используйте [Neon.tech](https://neon.tech) или [Supabase](https://supabase.com) (бесплатный тариф).
- Примените схемы миграций:
  ```bash
  npx prisma db push
  ```

### 3. Очередь Redis
- Используйте [Upstash Redis](https://upstash.com) или Railway Redis.

### 4. Фоновые Воркеры (`worker-ingestor` & `worker-poller`)
Воркеры должны работать **непрерывно (Daemon)**, поэтому их лучше развернуть на [Railway.app](https://railway.app) или [Render.com](https://render.com) (тип сервиса *Background Worker*):
- Команда запуска воркера парсинга:
  ```bash
  npx tsx src/workers/ingestor-shopify.ts
  ```
- Команда запуска планировщика:
  ```bash
  npx tsx src/workers/poller.ts
  ```

---

## 🛠️ Полезные команды для обслуживания

### Обновление кода приложения в продакшене:
```bash
git pull origin main
docker compose up -d --build
```

### Обновление схемы базы данных Prisma:
```bash
docker compose exec web npx prisma db push
```

### Очистка логов и неиспользуемых Docker образов:
```bash
docker system prune -f
```
