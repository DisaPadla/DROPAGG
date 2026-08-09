import { NextResponse } from "next/server";
import { ensureTablesExist } from "@/lib/db-init";

export async function GET() {
  const success = await ensureTablesExist();
  if (success) {
    return NextResponse.json({ success: true, message: "Database tables initialized successfully in Supabase!" });
  } else {
    return NextResponse.json({ error: "Failed to initialize database tables." }, { status: 500 });
  }
}
