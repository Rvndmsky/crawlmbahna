import { NextRequest, NextResponse } from "next/server";
import { readSettings, writeSettings, maskKey } from "@/lib/config";
import { cacheDiRedis } from "@/lib/cache";
import { validateToken, COOKIE } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function guard(req: NextRequest) {
  return validateToken(req.cookies.get(COOKIE)?.value);
}

export async function GET(req: NextRequest) {
  if (!guard(req))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const s = readSettings();
  // Jangan bocorkan key penuh ke browser — hanya masked + flag ada/tidak.
  return NextResponse.json({
    provider: s.provider,
    baseURL: s.baseURL,
    model: s.model,
    webSearch: s.webSearch,
    keyMasked: maskKey(s.apiKey),
    hasKey: !!s.apiKey,
    cache: cacheDiRedis ? "redis" : "file",
  });
}

export async function POST(req: NextRequest) {
  if (!guard(req))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const next = writeSettings({
      provider: body.provider === "openai" ? "openai" : "anthropic",
      baseURL: String(body.baseURL || "").trim(),
      model: String(body.model || "").trim(),
      webSearch: !!body.webSearch,
      apiKey: typeof body.apiKey === "string" ? body.apiKey.trim() : "",
    });
    return NextResponse.json({
      ok: true,
      provider: next.provider,
      baseURL: next.baseURL,
      model: next.model,
      webSearch: next.webSearch,
      keyMasked: maskKey(next.apiKey),
      hasKey: !!next.apiKey,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "gagal menyimpan" },
      { status: 400 }
    );
  }
}
