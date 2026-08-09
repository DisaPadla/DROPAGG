import { prisma } from "../src/lib/prisma";
import { inferCategory } from "../src/lib/category-classifier";

async function main() {
  console.log("Re-classifying existing database products into smart categories...");

  const products = await prisma.product.findMany();
  let updatedCount = 0;

  for (const p of products) {
    const newCat = inferCategory(p.title, p.category || "", [], p.description || "");
    if (newCat !== p.category) {
      await prisma.product.update({
        where: { id: p.id },
        data: { category: newCat },
      });
      updatedCount++;
    }
  }

  console.log(`Re-classification complete! Updated ${updatedCount} / ${products.length} products.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
