import { NextRequest, NextResponse } from "next/server";
import { verifyCredentials, createSession, COOKIE } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let email = "";
  let password = "";
  try {
    const body = await req.json();
    email = body.email || "";
    password = body.password || "";
  } catch {
    return NextResponse.json({ error: "input tidak valid" }, { status: 400 });
  }

  if (!verifyCredentials(email, password)) {
    return NextResponse.json(
      { error: "email atau password salah" },
      { status: 401 }
    );
  }

  const token = createSession();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 12 * 60 * 60,
  });
  return res;
}
