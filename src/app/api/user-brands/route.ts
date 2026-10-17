import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { ensureTablesExist } from "@/lib/db-init";

export async function GET() {
  try {
    let currentUser;
    try {
      currentUser = await getCurrentUser();
    } catch {
      await ensureTablesExist();
      currentUser = await getCurrentUser();
    }

    const userBrands = await prisma.userBrand.findMany({
      where: { userId: currentUser.id },
      include: { brand: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      user: currentUser,
      brandIds: userBrands.map((ub) => ub.brandId),
      brands: userBrands.map((ub) => ub.brand),
    });
  } catch (error: unknown) {
    console.error("[UserBrands GET Error]", error);
    return NextResponse.json(
      { error: "Failed to load user radar brands" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const brandId = typeof body?.brandId === "string" ? body.brandId.trim() : "";

    if (!brandId) {
      return NextResponse.json({ error: "Missing brandId" }, { status: 400 });
    }

    let currentUser;
    try {
      currentUser = await getCurrentUser();
    } catch {
      await ensureTablesExist();
      currentUser = await getCurrentUser();
    }

    const brand = await prisma.brand.findUnique({ where: { id: brandId } });
    if (!brand) {
      return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    }

    const userBrand = await prisma.userBrand.upsert({
      where: {
        userId_brandId: {
          userId: currentUser.id,
          brandId: brand.id,
        },
      },
      update: {},
      create: {
        userId: currentUser.id,
        brandId: brand.id,
      },
    });

    return NextResponse.json({
      success: true,
      tracked: true,
      userBrand,
    });
  } catch (error: unknown) {
    console.error("[UserBrands POST Error]", error);
    return NextResponse.json(
      { error: "Failed to add brand to radar" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    let brandId = url.searchParams.get("brandId") || "";

    if (!brandId) {
      const body = await req.json().catch(() => ({}));
      if (typeof body?.brandId === "string") {
        brandId = body.brandId.trim();
      }
    }

    if (!brandId) {
      return NextResponse.json({ error: "Missing brandId" }, { status: 400 });
    }

    let currentUser;
    try {
      currentUser = await getCurrentUser();
    } catch {
      await ensureTablesExist();
      currentUser = await getCurrentUser();
    }

    await prisma.userBrand.deleteMany({
      where: {
        userId: currentUser.id,
        brandId,
      },
    });

    return NextResponse.json({
      success: true,
      tracked: false,
    });
  } catch (error: unknown) {
    console.error("[UserBrands DELETE Error]", error);
    return NextResponse.json(
      { error: "Failed to remove brand from radar" },
      { status: 500 }
    );
  }
}
