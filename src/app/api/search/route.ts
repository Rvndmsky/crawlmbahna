import { NextRequest, NextResponse } from "next/server";
import { search } from "@/lib/search";
import { readSettings } from "@/lib/config";
import { validateToken, COOKIE } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // web search bisa lama

export async function GET(req: NextRequest) {
  if (!validateToken(req.cookies.get(COOKIE)?.value)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const q = req.nextUrl.searchParams.get("q") || "";
  const fresh = req.nextUrl.searchParams.get("fresh") === "1";
  if (!q.trim()) {
    return NextResponse.json({ error: "kueri kosong" }, { status: 400 });
  }
  if (!readSettings().apiKey) {
    return NextResponse.json(
      { error: "API key belum di-set. Buka halaman ⚙ Setup." },
      { status: 500 }
    );
  }
  try {
    const result = await search(q, { fresh });
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("search error:", err);
    return NextResponse.json(
      { error: err?.message || "gagal mencari" },
      { status: 500 }
    );
  }
}
