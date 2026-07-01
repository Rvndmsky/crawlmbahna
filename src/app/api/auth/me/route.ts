import { NextRequest, NextResponse } from "next/server";
import { validateToken, COOKIE } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE)?.value;
  return NextResponse.json({ authed: validateToken(token) });
}
