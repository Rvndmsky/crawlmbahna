import { NextRequest, NextResponse } from "next/server";
import { validateToken, COOKIE } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Agent bisa memakai beberapa tool per giliran (cari web, buka halaman).
export const maxDuration = 300;

// Jembatan ke Hermes Agent di VPS (API server OpenAI-compatible).
// HERMES_URL  : alamat HTTPS API server, mis. https://hermes.domain.com
// HERMES_KEY  : sama dengan API_SERVER_KEY di ~/.hermes/.env VPS.
// Key hanya hidup di server ini; browser tidak pernah melihatnya.

const MAKS_PESAN = 40;
const MAKS_PANJANG = 8000;

type Pesan = { role: "user" | "assistant"; content: string };

function bersihkan(raw: unknown): Pesan[] | null {
  if (!Array.isArray(raw)) return null;
  const out: Pesan[] = [];
  for (const m of raw.slice(-MAKS_PESAN)) {
    if (!m || (m.role !== "user" && m.role !== "assistant")) continue;
    if (typeof m.content !== "string" || !m.content.trim()) continue;
    out.push({ role: m.role, content: m.content.slice(0, MAKS_PANJANG) });
  }
  return out.length && out[out.length - 1].role === "user" ? out : null;
}

export async function POST(req: NextRequest) {
  if (!validateToken(req.cookies.get(COOKIE)?.value)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const base = (process.env.HERMES_URL || "").replace(/\/+$/, "");
  const key = process.env.HERMES_KEY || "";
  if (!base || !key) {
    return NextResponse.json(
      { error: "Hermes belum dihubungkan (HERMES_URL / HERMES_KEY kosong)." },
      { status: 503 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "input tidak valid" }, { status: 400 });
  }
  const messages = bersihkan(body?.messages);
  if (!messages) {
    return NextResponse.json({ error: "pesan kosong" }, { status: 400 });
  }

  let up: Response;
  try {
    up = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "hermes-agent", stream: true, messages }),
      signal: req.signal, // pengguna menutup/berhenti -> hentikan agent juga
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Hermes tidak bisa dihubungi: ${err?.message || err}` },
      { status: 502 }
    );
  }
  if (!up.ok || !up.body) {
    const t = await up.text().catch(() => "");
    return NextResponse.json(
      { error: `Hermes ${up.status}: ${t.slice(0, 300)}` },
      { status: 502 }
    );
  }

  // Teruskan SSE apa adanya; klien yang mengurai delta & progres tool.
  return new Response(up.body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
