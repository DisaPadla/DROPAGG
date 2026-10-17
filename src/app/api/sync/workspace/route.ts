import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { getProductDropBadges, RESTOCK_WINDOW_MS } from "@/lib/drop-events";

export async function GET() {
  try {
    const currentUser = await getCurrentUser();

    // Fetch active user's brands
    const userBrands = await prisma.userBrand.findMany({
      where: { userId: currentUser.id },
      include: { brand: true },
    });

    const brandIds = userBrands.map((ub) => ub.brandId);

    // Fetch products belonging to user's brands
    const products = await prisma.product.findMany({
      where: { brandId: { in: brandIds } },
      include: {
        variants: {
          include: {
            dropEvents: {
              where: {
                detectedAt: {
                  gte: new Date(Date.now() - RESTOCK_WINDOW_MS),
                },
              },
              orderBy: { detectedAt: "desc" },
              take: 20,
            },
          },
        },
        brand: true,
      },
    });

    return NextResponse.json({
      userId: currentUser.id,
      userBrands: userBrands.map((ub) => ({
        id: ub.id,
        userId: ub.userId,
        brandId: ub.brandId,
      })),
      brands: userBrands.map((ub) => ub.brand),
      products: products.map((p) => {
        const badges = getProductDropBadges(p);
        return {
          id: p.id,
          brandId: p.brandId,
          canonicalUrl: p.canonicalUrl,
          externalId: p.externalId,
          title: p.title,
          description: p.description,
          category: p.category,
          mainImage: p.mainImage,
          createdAt: p.createdAt,
          variants: Array.isArray(p.variants)
            ? p.variants.map((v) => ({
                ...v,
                rawPrice: v.rawPrice != null ? Number(v.rawPrice) : 0,
                compareAtPrice: v.compareAtPrice != null ? Number(v.compareAtPrice) : null,
                normalizedPrice: v.normalizedPrice != null ? Number(v.normalizedPrice) : 0,
              }))
            : [],
          brand: p.brand,
          isNewDrop: badges.isNewDrop,
          isRestocked: badges.isRestocked,
          hasPriceDrop: badges.hasPriceDrop,
          restockedSizes: badges.restockedSizes,
        };
      }),
    });
  } catch (error: unknown) {
    console.error("[Sync Workspace Error]", error);
    return NextResponse.json({ error: "Failed to fetch sync dataset" }, { status: 500 });
  }
}
