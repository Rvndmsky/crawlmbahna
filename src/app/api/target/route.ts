import { NextRequest, NextResponse } from "next/server";
import { crawlTarget } from "@/lib/social";
import { readSettings } from "@/lib/config";
import { validateToken, COOKIE } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // sisir sosmed bisa lama

// GET /api/target?name=...&days=14&fresh=1
export async function GET(req: NextRequest) {
  if (!validateToken(req.cookies.get(COOKIE)?.value)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const name = req.nextUrl.searchParams.get("name") || "";
  const days = Number(req.nextUrl.searchParams.get("days")) || 14;
  const fresh = req.nextUrl.searchParams.get("fresh") === "1";
  if (!name.trim()) {
    return NextResponse.json({ error: "nama target kosong" }, { status: 400 });
  }
  if (!readSettings().apiKey) {
    return NextResponse.json(
      { error: "API key belum di-set. Buka halaman ⚙ Setup." },
      { status: 500 }
    );
  }
  try {
    return NextResponse.json(await crawlTarget(name, { fresh, days }));
  } catch (err: any) {
    console.error("target crawl error:", err);
    return NextResponse.json(
      { error: err?.message || "gagal menyisir sosmed" },
      { status: 500 }
    );
  }
}
