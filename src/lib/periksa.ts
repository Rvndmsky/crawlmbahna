import { readSettings } from "./config";
import { extractJson } from "./web";

// Pemeriksa akhir infografis.
//
// Perakit SVG bekerja dengan perkiraan lebar huruf, jadi cacat tata letak baru
// kelihatan setelah gambarnya jadi: kalimat terpotong, blok tumpang tindih,
// huruf terlalu kecil, atau isi keluar bingkai. Model teks tidak bisa menilai
// itu — yang bisa hanya model yang MELIHAT gambarnya.
//
// Karena itu gambar dirasterkan lebih dulu, lalu dikirim ke model penglihatan
// bersama isi yang seharusnya tertulis, supaya salah ketik pun ketahuan.

export type Temuan = {
  jenis: "terpotong" | "tumpang_tindih" | "ukuran" | "typo" | "kosong" | "lainnya";
  bagian: string; // bagian mana pada gambar
  keterangan: string;
  parah: "ringan" | "sedang" | "berat";
};

export type HasilPeriksa = {
  lolos: boolean;
  ringkasan: string;
  temuan: Temuan[];
  diperiksaPada: number;
  model: string;
};

const SYSTEM = `Anda pemeriksa mutu (QA) infografis. Anda MELIHAT gambar yang dilampirkan dan
menilai apakah layak diterbitkan sebagai lampiran laporan resmi.

Periksa dengan urutan berikut:
1. TEKS TERPOTONG — kalimat berakhir mendadak atau diakhiri "…" karena tidak muat.
   Sebutkan bagian mana.
2. TUMPANG TINDIH — teks menimpa teks lain, menimpa garis, keluar dari kotaknya,
   atau menabrak tepi gambar.
3. UKURAN & KESEIMBANGAN — ada huruf yang terlalu kecil untuk dibaca, kotak yang
   kosong melompong, atau ruang kosong besar yang menandakan isi gagal termuat.
4. SALAH KETIK — bandingkan teks pada gambar dengan DAFTAR ISI SEHARUSNYA yang
   diberikan. Laporkan ejaan yang salah, huruf hilang, atau kata yang berubah.
   JANGAN melaporkan perbedaan yang hanya soal pemenggalan baris.
5. BAGIAN KOSONG — segmen yang judulnya ada tetapi isinya tidak ada.

Aturan menilai:
- Laporkan HANYA cacat yang benar-benar terlihat pada gambar. Jangan menduga-duga.
- Kalau gambarnya bersih, katakan bersih. Jangan mencari-cari kesalahan.
- "parah": berat = membuat informasi hilang atau salah; sedang = mengganggu
  keterbacaan; ringan = kosmetik.
- "lolos": true bila tidak ada temuan berat.

Keluarkan HANYA JSON valid, tanpa penjelasan, tanpa code fence:
{
  "lolos": true,
  "ringkasan": "satu kalimat penilaian keseluruhan",
  "temuan": [
    { "jenis": "terpotong", "bagian": "", "keterangan": "", "parah": "sedang" }
  ]
}`;

// Model penglihatan; bisa ditimpa lewat ENV.
export function modelPeriksa(): string {
  return process.env.AI_MODEL_PERIKSA || "google/gemini-2.5-flash";
}

export function periksaAktif(): boolean {
  return process.env.INFOGRAFIS_PERIKSA !== "false";
}

export async function periksaInfografis(
  pngBase64: string,
  isiSeharusnya: string
): Promise<HasilPeriksa | null> {
  if (!periksaAktif() || !pngBase64) return null;

  const s = readSettings();
  // Pemeriksaan butuh model penglihatan lewat endpoint OpenAI-compatible.
  if (!s.apiKey || s.provider !== "openai") return null;

  const model = modelPeriksa();
  const base = s.baseURL.replace(/\/+$/, "");

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${s.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://pejatenkeren.vercel.app",
        "X-Title": "mbahna",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  `Periksa infografis pada gambar ini.\n\n` +
                  `DAFTAR ISI SEHARUSNYA (untuk memeriksa salah ketik & bagian hilang):\n` +
                  isiSeharusnya.slice(0, 4000),
              },
              {
                type: "image_url",
                image_url: { url: `data:image/png;base64,${pngBase64}` },
              },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      console.error("periksa gagal:", res.status, (await res.text()).slice(0, 200));
      return null;
    }

    const json: any = await res.json();
    const teks = json?.choices?.[0]?.message?.content || "";
    const j = extractJson(teks);
    if (!j) return null;

    const temuan: Temuan[] = (Array.isArray(j.temuan) ? j.temuan : [])
      .filter((t: any) => t && (t.keterangan || t.bagian))
      .slice(0, 10)
      .map((t: any) => ({
        jenis: [
          "terpotong",
          "tumpang_tindih",
          "ukuran",
          "typo",
          "kosong",
          "lainnya",
        ].includes(t.jenis)
          ? t.jenis
          : "lainnya",
        bagian: String(t.bagian || "").slice(0, 60),
        keterangan: String(t.keterangan || "").slice(0, 240),
        parah: ["ringan", "sedang", "berat"].includes(t.parah) ? t.parah : "sedang",
      }));

    return {
      // Keputusan lolos dihitung di sini, bukan diserahkan ke model: satu pun
      // temuan berat berarti tidak lolos.
      lolos: !temuan.some((t) => t.parah === "berat"),
      ringkasan: String(j.ringkasan || "").slice(0, 240),
      temuan,
      diperiksaPada: Date.now(),
      model,
    };
  } catch (e: any) {
    console.error("periksa error:", e?.message);
    return null;
  }
}

// Susun daftar isi yang seharusnya tertulis, untuk pembanding salah ketik.
export function ringkasIsi(spec: any): string {
  const baris: string[] = [
    `Judul: ${spec.judul}`,
    spec.tanggal && `Tanggal: ${spec.tanggal}`,
    spec.subjudul && `Subjudul: ${spec.subjudul}`,
    spec.catatanAtas && `Catatan atas: ${spec.catatanAtas}`,
    `Klasifikasi: ${spec.klasifikasi} · Ancaman: ${spec.ancaman}`,
  ].filter(Boolean) as string[];

  for (const s of spec.statistik || []) baris.push(`Statistik: ${s.nilai} ${s.satuan} — ${s.label}`);
  for (const p of spec.peringkat || []) baris.push(`Peringkat: ${p.nama} = ${p.nilai} ${p.satuan}`);
  for (const s of spec.sorotan || []) baris.push(`Sorotan: ${s}`);
  for (const e of spec.entitas || []) baris.push(`Entitas: ${e.nama} — ${e.tokoh}`);
  for (const c of spec.catatan || []) baris.push(`Catatan: ${c}`);
  return baris.join("\n");
}
