import { prisma } from "@/lib/prisma";
import { getCurrentUser, SessionUser } from "@/lib/session";
import { ensureTablesExist } from "@/lib/db-init";
import { BrandsList, BrandItem } from "@/components/brands/brands-list";

export const dynamic = "force-dynamic";

interface BrandQueryRow {
  id: string;
  name: string;
  domain: string;
  platformType: string;
  syncStatus: string;
  baseCountry: string;
  defaultCurrency: string;
  userBrands?: { id: string }[];
  _count?: {
    products: number;
    userBrands: number;
  };
}

export default async function BrandsPage() {
  let currentUser: SessionUser | undefined;
  let allBrands: BrandQueryRow[] = [];
  try {
    currentUser = await getCurrentUser();
    allBrands = await prisma.brand.findMany({
      include: {
        _count: {
          select: { products: true, userBrands: true },
        },
        userBrands: {
          where: { userId: currentUser.id },
          select: { id: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  } catch (err) {
    console.warn("[BrandsPage] DB query failed, attempting table init:", err);
    try {
      await ensureTablesExist();
      currentUser = await getCurrentUser();
      allBrands = await prisma.brand.findMany({
        include: {
          _count: {
            select: { products: true, userBrands: true },
          },
          userBrands: {
            where: { userId: currentUser.id },
            select: { id: true },
          },
        },
        orderBy: { createdAt: "desc" },
      });
    } catch (retryErr) {
      console.warn("[BrandsPage] Retry failed:", retryErr);
    }
  }

  const brands: BrandItem[] = (allBrands || []).map((b) => ({
    id: b.id,
    name: b.name,
    domain: b.domain,
    platformType: b.platformType,
    syncStatus: b.syncStatus,
    baseCountry: b.baseCountry,
    defaultCurrency: b.defaultCurrency,
    isTracked: Array.isArray(b.userBrands) && b.userBrands.length > 0,
    _count: {
      products: b._count?.products || 0,
      userBrands: b._count?.userBrands || 0,
    },
  }));

  return (
    <div className="container mx-auto px-4 py-8">
      <BrandsList initialBrands={brands} currentUser={currentUser} />
    </div>
  );
}

