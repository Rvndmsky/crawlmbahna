import { NextRequest, NextResponse } from "next/server";
import { getShot } from "@/lib/fbstore";
import { validateToken, COOKIE } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sajikan tangkapan layar postingan Facebook yang dikirim worker.
// Disimpan terpisah dari entri (lihat lib/fbstore) supaya entri tetap ramping.
export async function GET(req: NextRequest) {
  if (!validateToken(req.cookies.get(COOKIE)?.value)) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  const id = req.nextUrl.searchParams.get("id") || "";
  if (!/^[a-z0-9-]{1,40}$/i.test(id)) {
    return new NextResponse("id tidak sah", { status: 400 });
  }

  const b64 = await getShot(id);
  if (!b64) return new NextResponse("tidak ada", { status: 404 });

  return new NextResponse(Buffer.from(b64, "base64"), {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, max-age=86400",
    },
  });
}
