import { NextRequest, NextResponse } from "next/server";
import { getTrending } from "@/lib/trending";
import { readSettings } from "@/lib/config";
import { validateToken, COOKIE } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!validateToken(req.cookies.get(COOKIE)?.value)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const fresh = req.nextUrl.searchParams.get("fresh") === "1";
  if (!readSettings().apiKey) {
    return NextResponse.json(
      { error: "API key belum di-set. Buka halaman ⚙ Setup." },
      { status: 500 }
    );
  }
  try {
    const result = await getTrending({ fresh });
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("trending error:", err);
    return NextResponse.json(
      { error: err?.message || "gagal memuat tren" },
      { status: 500 }
    );
  }
}
