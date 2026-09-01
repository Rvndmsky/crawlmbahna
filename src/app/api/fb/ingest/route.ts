import { NextRequest, NextResponse } from "next/server";
import {
  saveFbEntry,
  fbStats,
  saveShot,
  shotIdFor,
  type FbRawPost,
} from "@/lib/fbstore";
import { parseFbTime, umurHari } from "@/lib/fbtime";
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
  const content = String(p?.content || "").slice(0, 4000);
  const published = String(p?.published || "").slice(0, 80);
  return {
    url,
    account: String(p?.account || "").slice(0, 160),
    accountUrl: String(p?.accountUrl || "").slice(0, 400),
    published,
    publishedAt: parseFbTime(published),
    shotId: "",
    // Facebook tidak punya judul; kalau worker belum mengisinya, ambil kalimat
    // pertama isi post.
    title:
      String(p?.title || "").slice(0, 160) ||
      content.split(/\n|(?<=[.!?])\s+/)[0]?.slice(0, 120) ||
      "",
    content,
    engagementText: String(p?.engagementText || "").slice(0, 240),
    comments: (Array.isArray(p?.comments) ? p.comments : [])
      .slice(0, 15)
      .map((c: any) => ({
        author: String(c?.author || "").slice(0, 160),
        text: String(c?.text || "").slice(0, 800),
        likes: Math.max(0, Math.round(Number(c?.likes) || 0)),
        url: String(c?.url || "").slice(0, 500),
      }))
      .filter((c: { text: string }) => c.text),
  };
}

export async function POST(req: NextRequest) {
  const err = guardWorker(req);
  if (err) return NextResponse.json({ error: err }, { status: 401 });

  try {
    const body = await req.json();
    const query = String(body?.query || "").trim();
    if (!query) return NextResponse.json({ error: "kueri kosong" }, { status: 400 });

    const MAX_AGE_DAYS = Number(process.env.FB_MAX_AGE_DAYS) || 3;
    const mentah = (Array.isArray(body?.posts) ? body.posts : []) as any[];

    const posts: FbRawPost[] = [];
    let terlaluLama = 0;
    for (const raw of mentah) {
      const p = sanitize(raw);
      if (!p) continue;
      // Batas kesegaran: post yang jelas lebih tua dari H-3 ditolak. Post yang
      // waktunya tidak terbaca (publishedAt 0) tetap diterima.
      if (p.publishedAt && umurHari(p.publishedAt) > MAX_AGE_DAYS) {
        terlaluLama++;
        continue;
      }
      // Tangkapan layar dipisah dari entri supaya entri tetap ramping.
      const shot = String(raw?.shot || "");
      if (shot) {
        const id = shotIdFor(p.url);
        try {
          await saveShot(id, shot);
          p.shotId = id;
        } catch {
          /* gagal simpan gambar tidak boleh menggagalkan postnya */
        }
      }
      posts.push(p);
    }

    const saved = await saveFbEntry({
      query,
      collectedAt: Number(body?.collectedAt) || Date.now(),
      posts,
    });
    return NextResponse.json({
      ok: true,
      saved,
      received: posts.length,
      ditolakUmur: terlaluLama,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "gagal menyimpan" },
      { status: 400 }
    );
  }
}

// Status untuk halaman Settings (pakai sesi login biasa, bukan token worker).
export async function GET(req: NextRequest) {
  if (!validateToken(req.cookies.get(COOKIE)?.value)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    ...(await fbStats()),
    workerConfigured: !!process.env.FB_WORKER_TOKEN,
  });
}
