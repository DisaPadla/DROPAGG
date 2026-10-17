import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { ensureTablesExist } from "@/lib/db-init";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Missing brand ID" }, { status: 400 });
    }

    let currentUser;
    try {
      currentUser = await getCurrentUser();
    } catch {
      await ensureTablesExist();
      currentUser = await getCurrentUser();
    }

    const url = new URL(req.url);
    const hardDelete = url.searchParams.get("hard") === "true";

    // Remove the brand from the current user's personal Radar (UserBrand)
    await prisma.userBrand.deleteMany({
      where: {
        userId: currentUser.id,
        brandId: id,
      },
    });

    if (hardDelete) {
      const remainingSubscribers = await prisma.userBrand.count({
        where: { brandId: id },
      });

      if (remainingSubscribers === 0) {
        const deleted = await prisma.brand.deleteMany({
          where: { id },
        });
        if (deleted.count === 0) {
          return NextResponse.json({ error: "Brand not found" }, { status: 404 });
        }
        return NextResponse.json({
          success: true,
          hardDeleted: true,
          message: "Brand permanently deleted from global catalog",
        });
      }
    }

    return NextResponse.json({
      success: true,
      hardDeleted: false,
      message: "Brand removed from your Personal Radar (still available in Global Explore)",
    });
  } catch (error: unknown) {
    console.error("[Delete Brand API Error]", error);
    return NextResponse.json({ error: "Failed to remove brand" }, { status: 500 });
  }
}

