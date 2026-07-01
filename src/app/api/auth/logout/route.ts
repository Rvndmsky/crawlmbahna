import { NextResponse } from "next/server";
import { destroySession, COOKIE } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  destroySession(); // token lama langsung invalid; regenerate saat login berikutnya
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
