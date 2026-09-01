import { runOffline, extractJson } from "./web";

// Mesin Infografis: dokumen (PDF/DOCX) -> ringkasan terstruktur -> gambar SVG.
//
// Model TIDAK menggambar. Model hanya menyusun isi terstruktur; gambarnya
// dirakit di sini dengan tata letak dan palet tetap, supaya hasilnya konsisten
// dan tidak mengarang bentuk. Dokumen di luar cakupan ditolak beserta alasannya.

export type Sorotan = { nilai: string; label: string; catatan: string };
export type Poin = { judul: string; isi: string };
export type Linimasa = { waktu: string; peristiwa: string };

export type InfoSpec = {
  judul: string;
  subjudul: string;
  kategori: string;
  ringkasan: string;
  sorotan: Sorotan[]; // 2-4 angka kunci
  poin: Poin[]; // 3-5 pokok bahasan
  linimasa: Linimasa[]; // 0-5 tahapan waktu
  kesimpulan: string;
  sumber: string;
};

export type HasilAnalisa =
  | { diterima: true; spec: InfoSpec }
  | { diterima: false; alasan: string };

// ---------- palet (tervalidasi untuk buta warna; lihat catatan di README) ----------
const WARNA = {
  permukaan: "#fcfcfb",
  papan: "#f2f1ee",
  tinta: "#0b0b0b",
  tintaKedua: "#52514e",
  redup: "#898781",
  garis: "#e1e0d9",
  seri: ["#2a78d6", "#eb6834", "#1baf7a"], // biru, oranye, aqua
};

const SYSTEM = `Kamu perancang infografis untuk lembaga intelijen/pemerintahan Indonesia.
Tugasmu: membaca isi dokumen yang diunggah, lalu MENYUSUN ISI infografis satu halaman.
Kamu tidak menggambar; kamu hanya menyusun teks terstruktur yang akan dirakit jadi gambar.

CAKUPAN YANG DITERIMA (harus berkaitan):
politik, pemerintahan, kebijakan publik, regulasi/hukum, keamanan & pertahanan,
penegakan hukum/korupsi, pemilu, ekonomi negara/anggaran, isu sosial yang berdampak
pada kebijakan, laporan situasi/analisis intelijen, data statistik pemerintahan.

TOLAK dokumen yang:
- Tidak berkaitan dengan cakupan di atas (mis. resep masakan, tugas kuliah non-kebijakan,
  novel/fiksi, brosur jualan, undangan, CV/lamaran kerja, invoice/nota).
- Isinya terlalu sedikit untuk diringkas (kurang dari ~150 karakter bermakna) atau
  berupa hasil pindaian tanpa teks yang terbaca.
- Isinya utamanya data pribadi (NIK, nomor rekening, rekam medis, data keluarga) —
  bukan bahan yang pantas dijadikan infografis publik.
Bila ditolak, jelaskan alasannya secara spesifik dalam Bahasa Indonesia, sebutkan
dokumen itu sebenarnya tentang apa. JANGAN memaksakan infografis.

BILA DITERIMA, susun:
- "judul": maksimal 60 karakter, tegas dan spesifik (bukan "Laporan" saja).
- "subjudul": maksimal 90 karakter, penjelas.
- "kategori": SATU kata dari: politik, pemerintahan, hukum, korupsi, keamanan,
  pertahanan, pemilu, ekonomi, sosial, internasional.
- "ringkasan": 1-2 kalimat inti dokumen (maks 220 karakter).
- "sorotan": 2-4 ANGKA KUNCI dari dokumen. "nilai" pendek (mis. "Rp80,9 jt", "12.400",
  "63%"), "label" maks 34 karakter, "catatan" maks 40 karakter (boleh kosong).
  HANYA angka yang benar-benar ada di dokumen. Kalau dokumen tidak memuat angka,
  kembalikan daftar kosong — JANGAN mengarang angka.
- "poin": 3-5 pokok bahasan. "judul" maks 40 karakter, "isi" maks 150 karakter.
- "linimasa": 0-5 tahapan waktu bila dokumen memuat kronologi. "waktu" maks 20
  karakter, "peristiwa" maks 90 karakter.
- "kesimpulan": 1 kalimat, maks 160 karakter.
- "sumber": nama dokumen/instansi penerbit bila tersurat; kalau tidak ada, tulis
  "dokumen internal".

Bahasa Indonesia, faktual, netral. Ambil HANYA dari isi dokumen — jangan menambah
informasi dari luar, jangan menyimpulkan yang tidak tertulis.

Keluarkan HANYA JSON valid, tanpa penjelasan, tanpa code fence.
Bila menolak:
{ "tolak": true, "alasan": "..." }
Bila menerima:
{
  "tolak": false,
  "judul": "", "subjudul": "", "kategori": "politik", "ringkasan": "",
  "sorotan": [{ "nilai": "", "label": "", "catatan": "" }],
  "poin": [{ "judul": "", "isi": "" }],
  "linimasa": [{ "waktu": "", "peristiwa": "" }],
  "kesimpulan": "", "sumber": ""
}`;

const potong = (v: any, n: number) => String(v || "").replace(/\s+/g, " ").trim().slice(0, n);

function bacaSpec(teks: string, namaBerkas: string): HasilAnalisa {
  const j = extractJson(teks);
  if (!j) return { diterima: false, alasan: "model tidak mengembalikan hasil yang bisa dibaca" };
  if (j.tolak) {
    return {
      diterima: false,
      alasan: potong(j.alasan, 400) || "dokumen di luar cakupan pemantauan",
    };
  }

  const spec: InfoSpec = {
    judul: potong(j.judul, 60) || potong(namaBerkas, 60),
    subjudul: potong(j.subjudul, 90),
    kategori: potong(j.kategori, 20).toLowerCase() || "umum",
    ringkasan: potong(j.ringkasan, 220),
    sorotan: (Array.isArray(j.sorotan) ? j.sorotan : [])
      .filter((s: any) => s && s.nilai)
      .slice(0, 4)
      .map((s: any) => ({
        nilai: potong(s.nilai, 14),
        label: potong(s.label, 34),
        catatan: potong(s.catatan, 40),
      })),
    poin: (Array.isArray(j.poin) ? j.poin : [])
      .filter((p: any) => p && (p.judul || p.isi))
      .slice(0, 5)
      .map((p: any) => ({ judul: potong(p.judul, 40), isi: potong(p.isi, 150) })),
    linimasa: (Array.isArray(j.linimasa) ? j.linimasa : [])
      .filter((l: any) => l && l.peristiwa)
      .slice(0, 5)
      .map((l: any) => ({ waktu: potong(l.waktu, 20), peristiwa: potong(l.peristiwa, 90) })),
    kesimpulan: potong(j.kesimpulan, 160),
    sumber: potong(j.sumber, 60) || "dokumen internal",
  };

  if (!spec.poin.length && !spec.ringkasan) {
    return { diterima: false, alasan: "isi dokumen tidak cukup untuk disusun jadi infografis" };
  }
  return { diterima: true, spec };
}

export async function analisaDokumen(
  isi: string,
  namaBerkas: string
): Promise<HasilAnalisa> {
  const bersih = isi.replace(/\s+\n/g, "\n").trim();
  if (bersih.length < 150) {
    return {
      diterima: false,
      alasan:
        "teks yang terbaca kurang dari 150 karakter — kemungkinan berkas hasil pindaian " +
        "(gambar tanpa teks) atau isinya memang kosong",
    };
  }

  // Batasi bahan yang dikirim: cukup untuk menangkap inti, hemat token & waktu.
  const bahan = bersih.slice(0, 24000);
  const prompt =
    `Nama berkas: "${namaBerkas}".\n` +
    `Panjang teks: ${bersih.length} karakter.\n\n` +
    `ISI DOKUMEN:\n"""\n${bahan}\n"""\n\n` +
    `Nilai dulu apakah dokumen ini masuk cakupan. Kalau tidak, tolak dengan alasan ` +
    `spesifik. Kalau masuk, susun isi infografisnya. Pastikan JSON valid dan lengkap.`;

  const teks = await runOffline(SYSTEM, prompt, 4000, "infografis");
  return bacaSpec(teks, namaBerkas);
}

// ---------- perakitan gambar ----------
const esc = (s: string) =>
  String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Pemenggal baris sederhana: SVG tidak punya word-wrap, jadi dihitung dari
// perkiraan lebar karakter.
function pecahBaris(teks: string, maksKarakter: number, maksBaris: number): string[] {
  const kata = String(teks || "").split(/\s+/).filter(Boolean);
  const baris: string[] = [];
  let kini = "";
  for (const k of kata) {
    if ((kini + " " + k).trim().length <= maksKarakter) {
      kini = (kini + " " + k).trim();
    } else {
      if (kini) baris.push(kini);
      kini = k;
      if (baris.length === maksBaris) break;
    }
  }
  if (kini && baris.length < maksBaris) baris.push(kini);
  if (baris.length === maksBaris && kata.join(" ").length > baris.join(" ").length) {
    baris[maksBaris - 1] = baris[maksBaris - 1].replace(/[.,;:]?$/, "…");
  }
  return baris;
}

function teksMultibaris(
  isi: string,
  x: number,
  y: number,
  opts: { ukuran: number; warna: string; maksKar: number; maksBaris: number; jarak?: number; tebal?: number }
): { svg: string; tinggi: number } {
  const baris = pecahBaris(isi, opts.maksKar, opts.maksBaris);
  const jarak = opts.jarak || Math.round(opts.ukuran * 1.45);
  const svg = baris
    .map(
      (b, i) =>
        `<text x="${x}" y="${y + i * jarak}" font-size="${opts.ukuran}" fill="${opts.warna}"` +
        (opts.tebal ? ` font-weight="${opts.tebal}"` : "") +
        `>${esc(b)}</text>`
    )
    .join("\n");
  return { svg, tinggi: baris.length * jarak };
}

// Infografis potret 1080x1350 — nyaman dibagikan & dicetak.
// "ilustrasi" = base64 gambar header (opsional). Gambar hanya jadi pita atas;
// seluruh teks tetap dirakit di sini supaya angkanya persis.
export function rakitSvg(
  spec: InfoSpec,
  tanggal = new Date(),
  ilustrasi = ""
): string {
  const L = 1080;
  const T = 1350;
  const M = 72; // margin kiri/kanan
  const isiLebar = L - M * 2;
  const bagian: string[] = [];
  let y = 0;

  // Kepala
  bagian.push(
    `<rect x="0" y="0" width="${L}" height="132" fill="${WARNA.tinta}"/>`,
    `<text x="${M}" y="60" font-size="26" font-weight="800" fill="#ffffff" letter-spacing="1">mbahna</text>`,
    `<text x="${M}" y="94" font-size="15" fill="#c3c2b7" letter-spacing="2">INFOGRAFIS INTELIJEN</text>`,
    `<rect x="${L - M - 220}" y="44" width="220" height="44" rx="22" fill="${WARNA.seri[0]}"/>`,
    `<text x="${L - M - 110}" y="72" font-size="17" font-weight="700" fill="#ffffff" text-anchor="middle">${esc(
      spec.kategori.toUpperCase()
    )}</text>`
  );
  y = 132 + 68;

  // Pita ilustrasi (bila ada). Diberi gradasi ke bawah supaya judul di
  // bawahnya tetap terbaca dan sambungannya tidak terlihat terpotong.
  const PITA = 250;
  if (ilustrasi) {
    bagian.push(
      `<defs><linearGradient id="lembut" x1="0" y1="0" x2="0" y2="1">` +
        `<stop offset="70%" stop-color="${WARNA.permukaan}" stop-opacity="0"/>` +
        `<stop offset="100%" stop-color="${WARNA.permukaan}" stop-opacity="1"/>` +
        `</linearGradient></defs>`,
      `<image x="0" y="132" width="${L}" height="${PITA}" preserveAspectRatio="xMidYMid slice" ` +
        `href="data:image/png;base64,${ilustrasi}"/>`,
      `<rect x="0" y="132" width="${L}" height="${PITA}" fill="url(#lembut)"/>`
    );
    y = 132 + PITA + 52;
  }

  // Judul
  const judul = teksMultibaris(spec.judul, M, y, {
    ukuran: 52,
    warna: WARNA.tinta,
    maksKar: 30,
    maksBaris: 3,
    jarak: 62,
    tebal: 800,
  });
  bagian.push(judul.svg);
  y += judul.tinggi + 14;

  if (spec.subjudul) {
    const sub = teksMultibaris(spec.subjudul, M, y, {
      ukuran: 22,
      warna: WARNA.tintaKedua,
      maksKar: 62,
      maksBaris: 2,
    });
    bagian.push(sub.svg);
    y += sub.tinggi + 12;
  }

  bagian.push(
    `<rect x="${M}" y="${y}" width="96" height="5" rx="2.5" fill="${WARNA.seri[1]}"/>`
  );
  y += 40;

  // Ringkasan
  if (spec.ringkasan) {
    const r = teksMultibaris(spec.ringkasan, M, y, {
      ukuran: 20,
      warna: WARNA.tinta,
      maksKar: 68,
      maksBaris: 3,
      jarak: 32,
    });
    bagian.push(r.svg);
    y += r.tinggi + 26;
  }

  // Angka kunci — tiap angka selalu berlabel (warna tidak pernah berdiri sendiri)
  if (spec.sorotan.length) {
    const n = spec.sorotan.length;
    const jarak = 16;
    const lebar = Math.floor((isiLebar - jarak * (n - 1)) / n);
    const tinggi = 148;
    spec.sorotan.forEach((s, i) => {
      const x = M + i * (lebar + jarak);
      const warna = WARNA.seri[i % WARNA.seri.length];
      const nilaiUkuran = s.nilai.length > 8 ? 34 : s.nilai.length > 5 ? 42 : 50;
      bagian.push(
        `<rect x="${x}" y="${y}" width="${lebar}" height="${tinggi}" rx="14" fill="${WARNA.papan}"/>`,
        `<rect x="${x}" y="${y}" width="6" height="${tinggi}" rx="3" fill="${warna}"/>`,
        `<text x="${x + 24}" y="${y + 62}" font-size="${nilaiUkuran}" font-weight="800" fill="${WARNA.tinta}">${esc(
          s.nilai
        )}</text>`,
        teksMultibaris(s.label, x + 24, y + 94, {
          ukuran: 16,
          warna: WARNA.tintaKedua,
          maksKar: Math.floor(lebar / 8.6),
          maksBaris: 2,
          jarak: 21,
        }).svg
      );
      if (s.catatan) {
        bagian.push(
          `<text x="${x + 24}" y="${y + tinggi - 16}" font-size="13" fill="${WARNA.redup}">${esc(
            s.catatan.slice(0, Math.floor(lebar / 7))
          )}</text>`
        );
      }
    });
    y += tinggi + 42;
  }

  // Pokok bahasan
  if (spec.poin.length) {
    bagian.push(
      `<text x="${M}" y="${y}" font-size="15" font-weight="700" fill="${WARNA.redup}" letter-spacing="2">POKOK BAHASAN</text>`
    );
    y += 30;
    for (let i = 0; i < spec.poin.length; i++) {
      // Ruang bawah dijaga: kotak kesimpulan + kaki menempati ~230px terakhir.
      if (y > T - 300) break;
      const p = spec.poin[i];
      const warna = WARNA.seri[i % WARNA.seri.length];
      bagian.push(
        `<circle cx="${M + 13}" cy="${y + 8}" r="13" fill="${warna}"/>`,
        `<text x="${M + 13}" y="${y + 14}" font-size="15" font-weight="700" fill="#ffffff" text-anchor="middle">${i + 1}</text>`,
        `<text x="${M + 42}" y="${y + 14}" font-size="21" font-weight="700" fill="${WARNA.tinta}">${esc(
          p.judul
        )}</text>`
      );
      const isi = teksMultibaris(p.isi, M + 42, y + 42, {
        ukuran: 17,
        warna: WARNA.tintaKedua,
        maksKar: 60,
        maksBaris: 2,
        jarak: 25,
      });
      bagian.push(isi.svg);
      y += 42 + isi.tinggi + 14;
    }
    y += 12;
  }

  // Linimasa
  if (spec.linimasa.length && y < T - 320) {
    bagian.push(
      `<text x="${M}" y="${y}" font-size="15" font-weight="700" fill="${WARNA.redup}" letter-spacing="2">KRONOLOGI</text>`
    );
    y += 28;
    const mulai = y;
    spec.linimasa.forEach((l, i) => {
      bagian.push(
        `<circle cx="${M + 7}" cy="${y + 6}" r="7" fill="${WARNA.seri[2]}"/>`,
        `<text x="${M + 30}" y="${y + 12}" font-size="16" font-weight="700" fill="${WARNA.seri[0]}">${esc(
          l.waktu
        )}</text>`,
        teksMultibaris(l.peristiwa, M + 30, y + 36, {
          ukuran: 16,
          warna: WARNA.tintaKedua,
          maksKar: 62,
          maksBaris: 2,
          jarak: 23,
        }).svg
      );
      y += 68;
    });
    bagian.push(
      `<rect x="${M + 6}" y="${mulai}" width="2" height="${y - mulai - 40}" fill="${WARNA.garis}"/>`
    );
    y += 10;
  }

  // Kesimpulan
  if (spec.kesimpulan) {
    const k = teksMultibaris(spec.kesimpulan, M + 24, T - 176, {
      ukuran: 19,
      warna: WARNA.tinta,
      maksKar: 66,
      maksBaris: 3,
      jarak: 28,
    });
    bagian.push(
      `<rect x="${M}" y="${T - 214}" width="${isiLebar}" height="112" rx="14" fill="${WARNA.papan}"/>`,
      `<rect x="${M}" y="${T - 214}" width="6" height="112" rx="3" fill="${WARNA.seri[1]}"/>`,
      `<text x="${M + 24}" y="${T - 186}" font-size="13" font-weight="700" fill="${WARNA.redup}" letter-spacing="2">KESIMPULAN</text>`,
      k.svg
    );
  }

  // Kaki
  const tgl = tanggal.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  bagian.push(
    `<line x1="${M}" y1="${T - 68}" x2="${L - M}" y2="${T - 68}" stroke="${WARNA.garis}" stroke-width="1"/>`,
    `<text x="${M}" y="${T - 40}" font-size="14" fill="${WARNA.redup}">Sumber: ${esc(
      spec.sumber
    )}</text>`,
    `<text x="${L - M}" y="${T - 40}" font-size="14" fill="${WARNA.redup}" text-anchor="end">Disusun ${esc(
      tgl
    )}</text>`
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${T}" viewBox="0 0 ${L} ${T}" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif">
<rect width="${L}" height="${T}" fill="${WARNA.permukaan}"/>
${bagian.join("\n")}
</svg>`;
}
