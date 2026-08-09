import { prisma } from "../src/lib/prisma";
import { filterProductsByGender } from "../src/lib/gender-classifier";

async function main() {
  const products = await prisma.product.findMany({
    include: { brand: true }
  });

  console.log(`Total products in DB: ${products.length}`);

  const menFiltered = filterProductsByGender(products, "men");

  console.log(`Products passing MEN filter: ${menFiltered.length}`);
  console.log("--- Listing titles of products passing MEN filter ---");

  menFiltered.forEach((p: any, idx: number) => {
    console.log(`${idx + 1}. [${p.brand?.name}] [Cat: ${p.category}] ${p.title}`);
  });
}

main().catch(console.error);
