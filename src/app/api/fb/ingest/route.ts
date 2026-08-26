import { NextRequest, NextResponse } from "next/server";
import { saveFbEntry, fbStats, type FbRawPost } from "@/lib/fbstore";
import { validateToken, COOKIE } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Titik masuk hasil worker Facebook (worker/fb-worker.mjs).
// Auth: header x-worker-token harus sama dengan ENV FB_WORKER_TOKEN.
// Tanpa ENV itu endpoint ini mati total (bukan terbuka) supaya tidak bisa
// dipakai orang lain menitipkan data.

function guardWorker(req: NextRequest): string | null {
  const expected = process.env.FB_WORKER_TOKEN || "";
  if (!expected) return "FB_WORKER_TOKEN belum di-set di server";
  const got = req.headers.get("x-worker-token") || "";
  if (got !== expected) return "token worker salah";
  return null;
}

function sanitize(p: any): FbRawPost | null {
  const url = String(p?.url || "");
  // Hanya URL Facebook; menolak titipan link dari domain lain.
  try {
    const host = new URL(url).hostname;
    if (!/(^|\.)(facebook\.com|fb\.com|m\.facebook\.com)$/i.test(host)) return null;
  } catch {
    return null;
  }
  return {
    url,
    account: String(p?.account || "").slice(0, 160),
    accountUrl: String(p?.accountUrl || "").slice(0, 400),
    published: String(p?.published || "").slice(0, 80),
    content: String(p?.content || "").slice(0, 800),
    engagementText: String(p?.engagementText || "").slice(0, 240),
  };
}

export async function POST(req: NextRequest) {
  const err = guardWorker(req);
  if (err) return NextResponse.json({ error: err }, { status: 401 });

  try {
    const body = await req.json();
    const query = String(body?.query || "").trim();
    if (!query) return NextResponse.json({ error: "kueri kosong" }, { status: 400 });

    const posts = (Array.isArray(body?.posts) ? body.posts : [])
      .map(sanitize)
      .filter((p: FbRawPost | null): p is FbRawPost => !!p);

    const saved = saveFbEntry({
      query,
      collectedAt: Number(body?.collectedAt) || Date.now(),
      posts,
    });
    return NextResponse.json({ ok: true, saved, received: posts.length });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "gagal menyimpan" },
      { status: 400 }
    );
  }
}

// Status untuk halaman ⚙ Setup (pakai sesi login biasa, bukan token worker).
export async function GET(req: NextRequest) {
  if (!validateToken(req.cookies.get(COOKIE)?.value)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    ...fbStats(),
    workerConfigured: !!process.env.FB_WORKER_TOKEN,
  });
}
