import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Missing brand ID" }, { status: 400 });
    }

    await prisma.brand.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: "Brand deleted from your local workspace" });
  } catch (error: any) {
    console.error("[Delete Brand API Error]", error);
    return NextResponse.json({ error: "Failed to delete brand" }, { status: 500 });
  }
}
