import { NextRequest, NextResponse } from "next/server";
import { bacaDokumen, jenisBerkas } from "@/lib/doc";
import { analisaDokumen, rakitSvg } from "@/lib/infografis";
import { buatIlustrasi, promptIlustrasi } from "@/lib/gambar";
import {
  simpanInfografis,
  daftarInfografis,
  hapusInfografis,
  idBaru,
  pakaiRedis,
} from "@/lib/infostore";
import { readSettings } from "@/lib/config";
import { validateToken, COOKIE } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAKS_BYTE = 12 * 1024 * 1024; // 12 MB

// GET: daftar infografis yang sudah dibuat.
export async function GET(req: NextRequest) {
  if (!validateToken(req.cookies.get(COOKIE)?.value)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    items: await daftarInfografis(),
    penyimpanan: pakaiRedis ? "redis" : "file",
  });
}

// POST: unggah PDF/DOCX -> nilai kelayakan -> rakit infografis.
export async function POST(req: NextRequest) {
  if (!validateToken(req.cookies.get(COOKIE)?.value)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!readSettings().apiKey) {
    return NextResponse.json(
      { error: "API key belum di-set. Buka halaman ⚙ Setup." },
      { status: 500 }
    );
  }

  try {
    const form = await req.formData();
    const berkas = form.get("file");
    // Judul dari pengguna dipakai apa adanya di daftar maupun di gambarnya;
    // kalau dikosongkan, judul disusun model dari isi dokumen.
    const judulPengguna = String(form.get("judul") || "").replace(/\s+/g, " ").trim().slice(0, 60);
    if (!(berkas instanceof File)) {
      return NextResponse.json({ error: "berkas tidak ada" }, { status: 400 });
    }

    // Saringan jenis: nama DAN tipe MIME harus sama-sama masuk akal.
    const jenis = jenisBerkas(berkas.name);
    if (!jenis) {
      return NextResponse.json(
        { error: "hanya menerima berkas .pdf atau .docx" },
        { status: 415 }
      );
    }
    const mimeSah =
      jenis === "pdf"
        ? /pdf/i.test(berkas.type || "pdf")
        : /officedocument\.wordprocessingml|octet-stream|^$/i.test(berkas.type || "");
    if (!mimeSah) {
      return NextResponse.json(
        { error: `tipe berkas tidak cocok dengan ekstensinya (${berkas.type})` },
        { status: 415 }
      );
    }
    if (berkas.size > MAKS_BYTE) {
      return NextResponse.json(
        { error: `berkas terlalu besar (maks ${MAKS_BYTE / 1024 / 1024} MB)` },
        { status: 413 }
      );
    }

    const buf = Buffer.from(await berkas.arrayBuffer());

    let isi;
    try {
      isi = await bacaDokumen(buf, berkas.name);
    } catch (e: any) {
      return NextResponse.json(
        { error: `gagal membaca isi berkas: ${e?.message || "format rusak"}` },
        { status: 422 }
      );
    }

    const hasil = await analisaDokumen(isi.text, berkas.name);
    if (!hasil.diterima) {
      // Penolakan bukan error teknis: 200 dengan alasan, supaya UI bisa
      // menampilkannya apa adanya.
      return NextResponse.json({
        diterima: false,
        alasan: hasil.alasan,
        namaBerkas: berkas.name,
        jumlahKarakter: isi.text.length,
      });
    }

    const id = idBaru();
    const spec = judulPengguna
      ? { ...hasil.spec, judul: judulPengguna }
      : hasil.spec;
    // Ilustrasi header dibuat model gambar. Gagal atau dimatikan lewat ENV ->
    // infografis tetap terbit, hanya tanpa pita gambar.
    const ilustrasi = await buatIlustrasi(
      promptIlustrasi(spec.judul, spec.kategori, spec.ringkasan)
    );
    const svg = rakitSvg(spec, new Date(), ilustrasi);
    const item = {
      id,
      judul: spec.judul,
      kategori: spec.kategori,
      namaBerkas: berkas.name,
      dibuatPada: Date.now(),
      spec,
    };
    await simpanInfografis(item, svg);

    return NextResponse.json({ diterima: true, item, svg });
  } catch (e: any) {
    console.error("infografis error:", e);
    return NextResponse.json(
      { error: e?.message || "gagal memproses berkas" },
      { status: 500 }
    );
  }
}

// DELETE: buang satu infografis dari daftar (beserta gambarnya).
export async function DELETE(req: NextRequest) {
  if (!validateToken(req.cookies.get(COOKIE)?.value)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const id = req.nextUrl.searchParams.get("id") || "";
  if (!/^[a-z0-9]{6,40}$/i.test(id)) {
    return NextResponse.json({ error: "id tidak sah" }, { status: 400 });
  }
  const ok = await hapusInfografis(id);
  return NextResponse.json({ ok, items: await daftarInfografis() });
}
