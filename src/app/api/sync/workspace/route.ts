import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export async function GET() {
  try {
    const currentUser = await getCurrentUser();

    // Fetch active user's brands
    const userBrands = await prisma.userBrand.findMany({
      where: { userId: currentUser.id },
      include: { brand: true },
    });

    const brandIds = userBrands.map((ub: any) => ub.brandId);

    // Fetch products belonging to user's brands
    const products = await prisma.product.findMany({
      where: { brandId: { in: brandIds } },
      include: { variants: true, brand: true },
    });

    return NextResponse.json({
      userId: currentUser.id,
      userBrands: userBrands.map((ub: any) => ({
        id: ub.id,
        userId: ub.userId,
        brandId: ub.brandId,
      })),
      brands: userBrands.map((ub: any) => ub.brand),
      products: products.map((p: any) => ({
        id: p.id,
        brandId: p.brandId,
        canonicalUrl: p.canonicalUrl,
        externalId: p.externalId,
        title: p.title,
        description: p.description,
        category: p.category,
        mainImage: p.mainImage,
        createdAt: p.createdAt,
        variants: p.variants,
        brand: p.brand,
      })),
    });
  } catch (error: any) {
    console.error("[Sync Workspace Error]", error);
    return NextResponse.json({ error: "Failed to fetch sync dataset" }, { status: 500 });
  }
}
