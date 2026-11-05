import { NextRequest, NextResponse } from "next/server";
import { validateToken, COOKIE } from "@/lib/auth";

const PER_PAGE = 9; // Bandung. Jakarta fixed 8 from upstream.

type Cam = { id: string; name: string; embed: string; type: "iframe" | "hls"; badge?: string };

async function fetchJakarta(page: number, search: string) {
  const url = new URL("https://jakcctv.jakarta.go.id/publik/data");
  url.searchParams.set("page", String(page));
  if (search) url.searchParams.set("q", search);

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": "Mozilla/5.0" },
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error("Jakarta CCTV API error");
  const json = await res.json();
  const html: string = json.cards || "";
  const total: number = json.total || 0;

  const cams: Cam[] = [];
  const rx = /src="([^"]+)"[\s\S]*?class="title">([^<]+)<[\s\S]*?class="badge">([^<]+)</g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    cams.push({ id: m[1], name: m[2].trim(), embed: m[1], type: "iframe", badge: m[3].trim() });
  }
  return { cameras: cams, total, page, pages: Math.ceil(total / PER_PAGE) || 1 };
}

let bandungCache: { data: Cam[]; ts: number } | null = null;

async function fetchBandung(page: number, search: string) {
  if (!bandungCache || Date.now() - bandungCache.ts > 300_000) {
    const res = await fetch("https://pelindung.bandung.go.id:8443/api/cek", {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 300 },
    });
    if (!res.ok) throw new Error("Bandung CCTV API error");
    const arr: { id: string; cctv_name: string; stream_cctv: string; dinas?: string }[] = await res.json();
    bandungCache = {
      data: arr.map((c) => ({ id: c.id, name: c.cctv_name, embed: c.stream_cctv, type: "hls" as const, badge: c.dinas })),
      ts: Date.now(),
    };
  }

  let list = bandungCache.data;
  if (search) {
    const q = search.toLowerCase();
    list = list.filter((c) => c.name.toLowerCase().includes(q) || (c.badge || "").toLowerCase().includes(q));
  }

  const total = list.length;
  const pages = Math.ceil(total / PER_PAGE) || 1;
  const start = (page - 1) * PER_PAGE;
  return { cameras: list.slice(start, start + PER_PAGE), total, page, pages };
}

export async function GET(req: NextRequest) {
  if (!validateToken(req.cookies.get(COOKIE)?.value)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const kota = req.nextUrl.searchParams.get("kota") || "jakarta";
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") || "1") || 1);
  const search = req.nextUrl.searchParams.get("q") || "";

  try {
    const data = kota === "bandung" ? await fetchBandung(page, search) : await fetchJakarta(page, search);
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "gagal memuat CCTV" }, { status: 502 });
  }
}
