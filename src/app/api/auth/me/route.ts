import { NextRequest, NextResponse } from "next/server";
import { validateToken, COOKIE, sessionUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE)?.value;
  const authed = validateToken(token);
  // Nama dipakai untuk sapaan "Login as ..." di bilah atas.
  return NextResponse.json({ authed, ...(authed ? sessionUser() : {}) });
}
