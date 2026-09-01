import { NextRequest, NextResponse } from "next/server";
import { getDossier } from "@/lib/dossier";
import { readSettings } from "@/lib/config";
import { validateToken, COOKIE } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!validateToken(req.cookies.get(COOKIE)?.value)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.searchParams.get("url") || "";
  const title = req.nextUrl.searchParams.get("title") || "";
  const heat = req.nextUrl.searchParams.get("heat") || "";
  const subject = req.nextUrl.searchParams.get("subject") || "";
  const fresh = req.nextUrl.searchParams.get("fresh") === "1";
  if (!url.trim() && !title.trim()) {
    return NextResponse.json({ error: "target kosong" }, { status: 400 });
  }
  if (!readSettings().apiKey) {
    return NextResponse.json(
      { error: "API key belum di-set. Buka halaman Settings." },
      { status: 500 }
    );
  }
  // Konteks "perluas cakupan" hanya saat TANPA url spesifik (mis. klik peta/kota).
  // Bila ada url, dossier fokus ke artikel itu.
  const context =
    heat && subject && !url
      ? `"${subject}" dinilai SKOR SUHU POLITIK ${heat}/100 hari ini. ` +
        `Di "skor_alasan": jelaskan TOPIK/ISU APA SAJA (sebutkan beberapa isu spesifik + tokoh/lembaga terlibat) ` +
        `yang membuat suhu setinggi itu, plus volume & intensitas pemberitaan. ` +
        `Di "sumber_terkait": lampirkan 3-6 link berita terkait (fokus 7 hari terakhir). ` +
        `Jangan hanya bahas satu artikel — cakup gambaran situasi ${subject}.`
      : undefined;
  try {
    const result = await getDossier(url, title, {
      fresh,
      context,
      keyExtra: heat && subject ? `h${heat}` : undefined,
    });
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("dossier error:", err);
    return NextResponse.json(
      { error: err?.message || "gagal menyusun dossier" },
      { status: 500 }
    );
  }
}
