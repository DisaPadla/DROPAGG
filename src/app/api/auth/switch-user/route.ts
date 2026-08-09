import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getOrCreateUserByEmail } from "@/lib/session";

export async function POST(req: Request) {
  try {
    const { email, name } = await req.json();
    if (!email) {
      return NextResponse.json({ error: "Missing email" }, { status: 400 });
    }

    const user = await getOrCreateUserByEmail(email, name);
    const cookieStore = await cookies();
    cookieStore.set("user_id", user.id, { path: "/", maxAge: 60 * 60 * 24 * 30 });

    return NextResponse.json({ success: true, user });
  } catch (error: any) {
    console.error("[Switch User API Error]", error);
    return NextResponse.json({ error: "Failed to switch user" }, { status: 500 });
  }
}
