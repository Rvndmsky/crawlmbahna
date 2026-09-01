import { NextRequest, NextResponse } from "next/server";
import { ambilSvg } from "@/lib/infostore";
import { validateToken, COOKIE } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sajikan gambar infografis (SVG) berdasarkan id.
export async function GET(req: NextRequest) {
  if (!validateToken(req.cookies.get(COOKIE)?.value)) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  const id = req.nextUrl.searchParams.get("id") || "";
  if (!/^[a-z0-9]{6,40}$/i.test(id)) {
    return new NextResponse("id tidak sah", { status: 400 });
  }

  const svg = await ambilSvg(id);
  if (!svg) return new NextResponse("tidak ada", { status: 404 });

  return new NextResponse(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "private, max-age=86400",
    },
  });
}
