import { NextRequest, NextResponse } from "next/server";
import { validateToken, COOKIE } from "@/lib/auth";
import {
  ambilThread,
  daftarThread,
  hapusThread,
  idValid,
  simpanThread,
} from "@/lib/chatstore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Riwayat chat Duryudana.
// GET            -> daftar thread (terbaru dulu)
// GET ?id=...    -> isi satu thread
// PUT {id, messages} -> simpan / perbarui thread
// DELETE ?id=... -> hapus thread

function tolak() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
const login = (req: NextRequest) => validateToken(req.cookies.get(COOKIE)?.value);

export async function GET(req: NextRequest) {
  if (!login(req)) return tolak();
  const id = req.nextUrl.searchParams.get("id");
  try {
    if (id) {
      if (!idValid(id)) return NextResponse.json({ error: "id tidak valid" }, { status: 400 });
      const t = await ambilThread(id);
      return t
        ? NextResponse.json(t)
        : NextResponse.json({ error: "tidak ditemukan" }, { status: 404 });
    }
    return NextResponse.json({ threads: await daftarThread() });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "gagal membaca riwayat" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  if (!login(req)) return tolak();
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "input tidak valid" }, { status: 400 });
  }
  if (!idValid(body?.id)) return NextResponse.json({ error: "id tidak valid" }, { status: 400 });
  try {
    const meta = await simpanThread(body.id, body.messages);
    return meta
      ? NextResponse.json({ thread: meta })
      : NextResponse.json({ error: "pesan kosong" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "gagal menyimpan" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!login(req)) return tolak();
  const id = req.nextUrl.searchParams.get("id");
  if (!idValid(id)) return NextResponse.json({ error: "id tidak valid" }, { status: 400 });
  try {
    await hapusThread(id);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "gagal menghapus" }, { status: 500 });
  }
}
