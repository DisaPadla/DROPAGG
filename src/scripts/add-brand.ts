import { prisma } from "../lib/prisma";
import { ingestionQueue } from "../lib/queue";

async function main() {
  const name = process.argv[2];
  const domain = process.argv[3];
  
  if (!name || !domain) {
    console.error("❌ Ошибка: Укажите название бренда и его домен.");
    console.error("Использование: npx tsx src/scripts/add-brand.ts \"Название Бренда\" domain.com");
    process.exit(1);
  }

  const feedUrl = `https://${domain}/products.json`; // По умолчанию предполагаем Shopify

  console.log(`Добавляем бренд ${name} (${domain})...`);

  // Проверяем, существует ли бренд, чтобы не дублировать
  let brand = await prisma.brand.findUnique({ where: { domain } });

  if (!brand) {
    brand = await prisma.brand.create({
      data: {
        name,
        domain,
        platformType: "SHOPIFY", // Для начала работаем с Shopify
        baseCountry: "US",
        defaultCurrency: "USD" // Базовая валюта
      }
    });
    console.log(`✅ Бренд сохранен в базу с ID: ${brand.id}`);
  } else {
    console.log(`⚠️ Бренд с таким доменом уже существует (ID: ${brand.id})`);
  }
  
  // Отправляем задачу в очередь на полное скачивание каталога
  await ingestionQueue.add(`ingest-${brand.id}-${Date.now()}`, {
    brandId: brand.id,
    feedUrl: feedUrl,
    platformType: brand.platformType
  });

  console.log(`🚀 Задача на загрузку товаров поставлена в очередь (Ingestion Queue)!`);
  
  // Чтобы товары действительно скачались, нужно чтобы работал воркер
  console.log(`\n👉 Чтобы запустить процесс скачивания, откройте новый терминал и выполните:`);
  console.log(`npx tsx src/workers/ingestor-shopify.ts`);
  
  process.exit(0);
}

main();
