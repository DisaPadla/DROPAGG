import { prisma } from "@/lib/prisma";
import { BrandsList, BrandItem } from "@/components/brands/brands-list";

export default async function BrandsPage() {
  const allBrands = await prisma.brand.findMany({
    include: {
      _count: {
        select: { products: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const brands: BrandItem[] = allBrands.map((b: any) => ({
    id: b.id,
    name: b.name,
    domain: b.domain,
    platformType: b.platformType,
    syncStatus: b.syncStatus,
    baseCountry: b.baseCountry,
    defaultCurrency: b.defaultCurrency,
    _count: {
      products: b._count.products,
    },
  }));

  return (
    <div className="container mx-auto px-4 py-8">
      <BrandsList initialBrands={brands} />
    </div>
  );
}
