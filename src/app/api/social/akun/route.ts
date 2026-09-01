import { NextRequest, NextResponse } from "next/server";
import { ambilAntrian, simpanFollowers } from "@/lib/akunstore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Jembatan worker untuk jumlah pengikut akun.
// GET  -> daftar URL profil yang menunggu dibaca
// POST -> kiriman hasil pembacaan
//
// Dijaga token yang sama dengan worker Facebook. Tanpa ENV itu endpoint mati.
function guard(req: NextRequest): string | null {
  const expected = process.env.FB_WORKER_TOKEN || "";
  if (!expected) return "FB_WORKER_TOKEN belum di-set di server";
  if ((req.headers.get("x-worker-token") || "") !== expected) return "token worker salah";
  return null;
}

export async function GET(req: NextRequest) {
  const err = guard(req);
  if (err) return NextResponse.json({ error: err }, { status: 401 });
  return NextResponse.json({ urls: await ambilAntrian() });
}

export async function POST(req: NextRequest) {
  const err = guard(req);
  if (err) return NextResponse.json({ error: err }, { status: 401 });

  try {
    const body = await req.json();
    const hasil = (Array.isArray(body?.hasil) ? body.hasil : [])
      .map((h: any) => ({
        url: String(h?.url || ""),
        followers: String(h?.followers || "").slice(0, 24),
        // Permalink dari profil resmi: inilah satu-satunya sumber postingan
        // yang bisa dipertanggungjawabkan untuk Threads/Instagram.
        posts: (Array.isArray(h?.posts) ? h.posts : [])
          .slice(0, 12)
          .map((p: any) => ({
            url: String(p?.url || ""),
            content: String(p?.content || "").slice(0, 500),
          }))
          .filter((p: { url: string }) => /^https?:\/\//i.test(p.url)),
        diperbaruiPada: Date.now(),
      }))
      .filter((h: { url: string }) => /^https?:\/\//i.test(h.url));

    const tersimpan = await simpanFollowers(hasil);
    return NextResponse.json({ ok: true, tersimpan, diterima: hasil.length });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "gagal menyimpan" },
      { status: 400 }
    );
  }
}
