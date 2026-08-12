import { NextRequest, NextResponse } from "next/server";
import dns from "node:dns/promises";
import { validateToken, COOKIE } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Proxy foto profil. CDN Instagram/X/Threads sering menolak hotlink dari
// browser (cek Referer/CORS), jadi gambarnya diambil dari sisi server lalu
// diteruskan. Balas 404 kalau bukan gambar -> UI jatuh ke avatar inisial.

const MAX_BYTES = 5 * 1024 * 1024;

// Tolak alamat internal (SSRF): loopback, link-local, dan blok privat.
function isPrivateIp(ip: string): boolean {
  if (ip.includes(":")) {
    const v = ip.toLowerCase();
    return v === "::1" || v.startsWith("fe80") || v.startsWith("fc") || v.startsWith("fd");
  }
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  const [a, b] = p;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

async function safeUrl(raw: string): Promise<URL | null> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  try {
    const addrs = await dns.lookup(u.hostname, { all: true });
    if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) return null;
  } catch {
    return null;
  }
  return u;
}

export async function GET(req: NextRequest) {
  if (!validateToken(req.cookies.get(COOKIE)?.value)) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  const raw = req.nextUrl.searchParams.get("u") || "";
  const url = await safeUrl(raw);
  if (!url) return new NextResponse("bad url", { status: 400 });

  try {
    const res = await fetch(url.toString(), {
      headers: {
        // Sebagian CDN menolak request tanpa UA wajar.
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/125.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
      redirect: "follow",
    });
    if (!res.ok) return new NextResponse("not found", { status: 404 });

    const type = res.headers.get("content-type") || "";
    if (!type.startsWith("image/")) {
      return new NextResponse("not an image", { status: 404 });
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) {
      return new NextResponse("too large", { status: 413 });
    }
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": type,
        // Cache 1 hari di browser; foto profil jarang berubah.
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch {
    return new NextResponse("fetch failed", { status: 404 });
  }
}
