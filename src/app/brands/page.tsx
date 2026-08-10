import { prisma } from "@/lib/prisma";
import { BrandsList, BrandItem } from "@/components/brands/brands-list";

export const revalidate = 30; // ISR cache for instant 10ms page transitions on Vercel CDN

export default async function BrandsPage() {
  let allBrands: any[] = [];
  try {
    allBrands = await prisma.brand.findMany({
      include: {
        _count: {
          select: { products: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  } catch (err) {
    console.warn("[BrandsPage] DB query bypassed during static build:", err);
  }

  const brands: BrandItem[] = (allBrands || []).map((b: any) => ({
    id: b.id,
    name: b.name,
    domain: b.domain,
    platformType: b.platformType,
    syncStatus: b.syncStatus,
    baseCountry: b.baseCountry,
    defaultCurrency: b.defaultCurrency,
    _count: {
      products: b._count?.products || 0,
    },
  }));

  return (
    <div className="container mx-auto px-4 py-8">
      <BrandsList initialBrands={brands} />
    </div>
  );
}
