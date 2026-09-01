import { runOffline, extractJson } from "./web";

// Mesin Infografis: dokumen (PDF/DOCX) -> struktur laporan -> gambar SVG.
//
// Model TIDAK menggambar. Model menyusun ISI dan HIRARKI; gambarnya dirakit di
// sini memakai grid, panel, dan palet tetap — supaya tata letaknya konsisten dan
// angka tidak pernah salah tulis. Dokumen di luar cakupan ditolak beserta
// alasannya.

export type Klasifikasi =
  | "BIASA"
  | "UNTUK LINGKUNGAN SENDIRI"
  | "TERBATAS"
  | "RAHASIA"
  | "SANGAT RAHASIA";

export type TingkatAncaman = "tidak ada" | "rendah" | "sedang" | "tinggi" | "kritis";

export type Statistik = { nilai: string; satuan: string; label: string };
export type ItemPeringkat = {
  nama: string;
  nilai: number;
  satuan: string;
  fokus: string;
};
export type Entitas = {
  nama: string;
  subjudul: string;
  tokoh: string;
  butir: string[];
  catatan: string;
};

export type InfoSpec = {
  judul: string;
  tanggal: string; // tanggal laporan, apa adanya dari dokumen
  subjudul: string;
  catatanAtas: string; // dasar/periode penelusuran
  kategori: string;
  klasifikasi: Klasifikasi;
  ancaman: TingkatAncaman;
  statistik: Statistik[]; // 3-4 angka pembuka
  peringkatJudul: string; // judul segmen daftar berperingkat
  peringkat: ItemPeringkat[]; // 3-6 baris berbatang
  sorotanJudul: string; // judul panel samping
  sorotan: string[]; // 2-4 butir sorotan
  entitasJudul: string; // judul segmen kartu
  entitas: Entitas[]; // 2-3 kartu kelompok/tokoh
  catatan: string[]; // 0-4 catatan tambahan
  sumber: string;
};

export type HasilAnalisa =
  | { diterima: true; spec: InfoSpec }
  | { diterima: false; alasan: string };

// ---------- palet ----------
// Navy dipakai untuk kerangka & judul (chrome, bukan penanda data). Tiga warna
// data di bawahnya lolos pemeriksaan buta warna pada latar putih; tiap penanda
// warna selalu ditemani label teks.
const WARNA = {
  permukaan: "#ffffff",
  papan: "#f4f6fa",
  navy: "#143a75",
  tinta: "#10151f",
  tintaKedua: "#414a58",
  redup: "#7b8494",
  garis: "#d7dee9",
  biru: "#2a78d6",
  merah: "#cf2e2e",
  hijau: "#16794c",
  status: {
    "tidak ada": "#7b8494",
    rendah: "#16794c",
    sedang: "#c8890a",
    tinggi: "#d9642c",
    kritis: "#cf2e2e",
  } as Record<string, string>,
};

const SYSTEM = `Anda adalah Desainer Infografis Intelijen dan Visualisasi Data profesional
untuk lembaga intelijen/pemerintahan Indonesia. Anda mengubah laporan analisis, profil
subjek, monitoring media, kronologi peristiwa, dan data statistik menjadi struktur
infografis satu halaman bergaya executive briefing.

PEMBAGIAN TUGAS: Anda TIDAK menggambar. Anda menyusun ISI dan HIRARKI informasinya;
grid, panel, tipografi, dan grafik batang dirakit sistem menjadi gambar vektor.
Ketepatan kata dan angka sepenuhnya ada di tangan Anda.

CAKUPAN YANG DITERIMA (harus berkaitan):
politik, pemerintahan, kebijakan publik, regulasi/hukum, keamanan & pertahanan,
penegakan hukum/korupsi, pemilu, ekonomi negara/anggaran, monitoring media & opini
publik, pemantauan aksi/unjuk rasa, isu sosial berdampak kebijakan, laporan situasi
atau analisis intelijen, data statistik pemerintahan.

TOLAK dokumen yang:
- Tidak berkaitan dengan cakupan di atas (resep masakan, tugas kuliah non-kebijakan,
  novel/fiksi, brosur jualan, undangan, CV/lamaran kerja, invoice/nota).
- Isinya terlalu sedikit untuk diringkas (kurang dari ~150 karakter bermakna) atau
  berupa hasil pindaian tanpa teks terbaca.
- Isinya utamanya data pribadi (NIK, nomor rekening, rekam medis, data keluarga).
Bila ditolak, sebutkan dokumen itu sebenarnya tentang apa. JANGAN memaksakan infografis.

BAHASA: Indonesia baku, lugas, singkat-padat-jelas. Tanpa salah ketik, tanpa teks
pengisi. Setiap kalimat bermakna analitis.

ISI YANG HARUS ANDA SUSUN:
- "judul": maksimal 52 karakter, HURUF BESAR semua, tegas dan spesifik.
- "tanggal": tanggal laporan seperti tertulis di dokumen (mis. "27 Agustus 2026").
  Kosongkan bila tidak tertulis.
- "subjudul": maksimal 90 karakter, menerangkan isi laporan.
- "catatan_atas": satu kalimat dasar/periode penelusuran (maks 80 karakter), mis.
  "Berdasarkan penelusuran jaring selama 72 jam terakhir". Kosongkan bila tak ada.
- "kategori": SATU kata: politik, pemerintahan, hukum, korupsi, keamanan, pertahanan,
  pemilu, ekonomi, sosial, internasional.
- "klasifikasi": BIASA | UNTUK LINGKUNGAN SENDIRI | TERBATAS | RAHASIA | SANGAT RAHASIA.
  Bersandar pada penanda yang TERTULIS di dokumen; bila tidak ada, isi "BIASA".
- "ancaman": tidak ada | rendah | sedang | tinggi | kritis. Dasarkan pada isi dokumen.
- "statistik": 3-4 ANGKA PEMBUKA. Tiap butir: "nilai" (angka/rentang pendek, mis. "72",
  "5", "25-26"), "satuan" (mis. "jam", "media", "Agustus 2026"; boleh kosong), "label"
  maks 30 karakter (mis. "periode monitoring").
- "peringkat_judul": judul segmen daftar, mis. "MONITORING MEDIA MAINSTREAM" atau
  "SEBARAN KASUS PER WILAYAH". HURUF BESAR.
- "peringkat": 3-6 baris terurut dari nilai terbesar. Tiap baris: "nama" maks 26
  karakter, "nilai" ANGKA (bukan teks), "satuan" maks 12 karakter (mis. "artikel",
  "kasus"), "fokus" maks 150 karakter berisi rincian/pokok bahasannya.
- "sorotan_judul": judul panel samping, mis. "SOROTAN PEMBERITAAN".
- "sorotan": 2-4 butir sorotan analitis, tiap butir maks 130 karakter.
- "entitas_judul": judul segmen kartu, mis. "KELOMPOK & TOKOH YANG AKTIF MENYUARAKAN".
- "entitas": 2-3 kartu. Tiap kartu: "nama" (singkatan/nama pendek, maks 18 karakter),
  "subjudul" (kepanjangan/keterangan, maks 44 karakter), "tokoh" (nama tokoh terkait,
  maks 60 karakter), "butir" 2-4 poin maks 95 karakter, "catatan" maks 120 karakter.
- "catatan": 0-4 catatan tambahan, tiap butir maks 190 karakter.
- "sumber": nama dokumen/instansi penerbit bila tersurat; bila tidak, "dokumen internal".

ATURAN ANGKA: semua angka HARUS tertulis di dokumen. Dilarang mengarang, menaksir,
atau membulatkan. Bila dokumen tidak memuat angka, kembalikan "statistik" dan
"peringkat" sebagai daftar kosong — infografis tetap bisa dirakit tanpa keduanya.

Bila satu bagian tidak ada bahannya di dokumen, kembalikan daftar/teks kosong untuk
bagian itu. JANGAN mengisi dengan karangan.

Keluarkan HANYA JSON valid, tanpa penjelasan, tanpa code fence.
Bila menolak: { "tolak": true, "alasan": "..." }
Bila menerima:
{
  "tolak": false,
  "judul": "", "tanggal": "", "subjudul": "", "catatan_atas": "",
  "kategori": "politik", "klasifikasi": "BIASA", "ancaman": "rendah",
  "statistik": [{ "nilai": "", "satuan": "", "label": "" }],
  "peringkat_judul": "", "peringkat": [{ "nama": "", "nilai": 0, "satuan": "", "fokus": "" }],
  "sorotan_judul": "", "sorotan": [""],
  "entitas_judul": "", "entitas": [{ "nama": "", "subjudul": "", "tokoh": "", "butir": [""], "catatan": "" }],
  "catatan": [""], "sumber": ""
}`;

const potong = (v: any, n: number) =>
  String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const daftar = (v: any, n: number, panjang: number): string[] =>
  (Array.isArray(v) ? v : []).map((x) => potong(x, panjang)).filter(Boolean).slice(0, n);

function bacaSpec(teksModel: string, namaBerkas: string): HasilAnalisa {
  const j = extractJson(teksModel);
  if (!j) {
    return { diterima: false, alasan: "model tidak mengembalikan hasil yang bisa dibaca" };
  }
  if (j.tolak) {
    return {
      diterima: false,
      alasan: potong(j.alasan, 400) || "dokumen di luar cakupan pemantauan",
    };
  }

  const KLASIFIKASI: Klasifikasi[] = [
    "BIASA",
    "UNTUK LINGKUNGAN SENDIRI",
    "TERBATAS",
    "RAHASIA",
    "SANGAT RAHASIA",
  ];
  const ANCAMAN: TingkatAncaman[] = ["tidak ada", "rendah", "sedang", "tinggi", "kritis"];
  const klas = potong(j.klasifikasi, 30).toUpperCase() as Klasifikasi;
  const anc = potong(j.ancaman, 20).toLowerCase() as TingkatAncaman;

  const spec: InfoSpec = {
    judul: (potong(j.judul, 52) || potong(namaBerkas, 52)).toUpperCase(),
    tanggal: potong(j.tanggal, 30),
    subjudul: potong(j.subjudul, 90),
    catatanAtas: potong(j.catatan_atas ?? j.catatanAtas, 80),
    kategori: potong(j.kategori, 20).toLowerCase() || "umum",
    klasifikasi: KLASIFIKASI.includes(klas) ? klas : "BIASA",
    ancaman: ANCAMAN.includes(anc) ? anc : "tidak ada",
    statistik: (Array.isArray(j.statistik) ? j.statistik : [])
      .filter((s: any) => s && s.nilai)
      .slice(0, 4)
      .map((s: any) => ({
        nilai: potong(s.nilai, 12),
        satuan: potong(s.satuan, 16),
        label: potong(s.label, 30),
      })),
    peringkatJudul: potong(j.peringkat_judul ?? j.peringkatJudul, 46).toUpperCase(),
    peringkat: (Array.isArray(j.peringkat) ? j.peringkat : [])
      .filter((p: any) => p && p.nama)
      .slice(0, 6)
      .map((p: any) => ({
        nama: potong(p.nama, 26),
        nilai: Math.max(0, Number(p.nilai) || 0),
        satuan: potong(p.satuan, 12),
        fokus: potong(p.fokus, 150),
      }))
      .sort((a: ItemPeringkat, b: ItemPeringkat) => b.nilai - a.nilai),
    sorotanJudul: potong(j.sorotan_judul ?? j.sorotanJudul, 40).toUpperCase(),
    sorotan: daftar(j.sorotan, 4, 130),
    entitasJudul: potong(j.entitas_judul ?? j.entitasJudul, 52).toUpperCase(),
    entitas: (Array.isArray(j.entitas) ? j.entitas : [])
      .filter((e: any) => e && e.nama)
      .slice(0, 3)
      .map((e: any) => ({
        nama: potong(e.nama, 18),
        subjudul: potong(e.subjudul, 44),
        tokoh: potong(e.tokoh, 60),
        butir: daftar(e.butir, 4, 95),
        catatan: potong(e.catatan, 120),
      })),
    catatan: daftar(j.catatan, 4, 190),
    sumber: potong(j.sumber, 60) || "dokumen internal",
  };

  const adaIsi =
    spec.statistik.length ||
    spec.peringkat.length ||
    spec.sorotan.length ||
    spec.entitas.length ||
    spec.catatan.length;
  if (!adaIsi) {
    return {
      diterima: false,
      alasan: "isi dokumen tidak cukup untuk disusun jadi infografis",
    };
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

  const bahan = bersih.slice(0, 24000);
  const prompt =
    `Nama berkas: "${namaBerkas}".\n` +
    `Panjang teks: ${bersih.length} karakter.\n\n` +
    `ISI DOKUMEN:\n"""\n${bahan}\n"""\n\n` +
    `Nilai dulu apakah dokumen ini masuk cakupan. Kalau tidak, tolak dengan alasan ` +
    `spesifik. Kalau masuk, susun isi infografisnya. Pastikan JSON valid dan lengkap.`;

  const hasil = await runOffline(SYSTEM, prompt, 5000, "infografis");
  return bacaSpec(hasil, namaBerkas);
}

// ---------- perakitan gambar ----------
const esc = (s: string) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// SVG tidak punya word-wrap; baris dipenggal dari perkiraan lebar karakter.
function pecahBaris(isi: string, maksKar: number, maksBaris: number): string[] {
  const kata = String(isi || "").split(/\s+/).filter(Boolean);
  const baris: string[] = [];
  let kini = "";
  for (const k of kata) {
    if ((kini + " " + k).trim().length <= maksKar) {
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

type OpsiTeks = {
  ukuran: number;
  warna: string;
  maksKar: number;
  maksBaris: number;
  jarak?: number;
  tebal?: number;
  italic?: boolean;
  anchor?: string;
};

function teks(isi: string, x: number, y: number, o: OpsiTeks) {
  const baris = pecahBaris(isi, o.maksKar, o.maksBaris);
  const jarak = o.jarak || Math.round(o.ukuran * 1.4);
  const svg = baris
    .map(
      (b, i) =>
        `<text x="${x}" y="${y + i * jarak}" font-size="${o.ukuran}" fill="${o.warna}"` +
        (o.tebal ? ` font-weight="${o.tebal}"` : "") +
        (o.italic ? ` font-style="italic"` : "") +
        (o.anchor ? ` text-anchor="${o.anchor}"` : "") +
        `>${esc(b)}</text>`
    )
    .join("\n");
  return { svg, tinggi: baris.length * jarak };
}

// Judul segmen: pita navy, seperti kepala tabel laporan.
function kepalaSegmen(judul: string, x: number, y: number, lebar: number) {
  return (
    `<rect x="${x}" y="${y}" width="${lebar}" height="40" rx="6" fill="${WARNA.navy}"/>` +
    `<text x="${x + 18}" y="${y + 27}" font-size="16" font-weight="800" fill="#ffffff" ` +
    `letter-spacing="1.2">${esc(judul)}</text>`
  );
}

// Infografis potret lebar 1080px; tinggi mengikuti isi.
export function rakitSvg(spec: InfoSpec, tanggal = new Date(), ilustrasi = ""): string {
  const L = 1080;
  const M = 28; // margin luar
  const W = L - M * 2; // lebar kerja
  const bagian: string[] = [];
  let y = 0;

  // --- pita klasifikasi ---
  const rahasia = /RAHASIA|TERBATAS/.test(spec.klasifikasi);
  const warnaKlas = rahasia ? WARNA.merah : WARNA.navy;
  bagian.push(
    `<rect x="0" y="0" width="${L}" height="30" fill="${warnaKlas}"/>`,
    `<text x="${L / 2}" y="20" font-size="13" font-weight="800" fill="#ffffff" ` +
      `letter-spacing="3.5" text-anchor="middle">${esc(spec.klasifikasi)}</text>`
  );
  y = 30;

  // --- ilustrasi (opsional) ---
  if (ilustrasi) {
    const PITA = 180;
    bagian.push(
      `<defs><linearGradient id="lembut" x1="0" y1="0" x2="0" y2="1">` +
        `<stop offset="60%" stop-color="${WARNA.permukaan}" stop-opacity="0"/>` +
        `<stop offset="100%" stop-color="${WARNA.permukaan}" stop-opacity="1"/></linearGradient></defs>`,
      `<image x="0" y="${y}" width="${L}" height="${PITA}" preserveAspectRatio="xMidYMid slice" ` +
        `href="data:image/png;base64,${ilustrasi}"/>`,
      `<rect x="0" y="${y}" width="${L}" height="${PITA}" fill="url(#lembut)"/>`
    );
    y += PITA - 14;
  }

  // --- kepala laporan ---
  y += 26;
  const judul = teks(spec.judul, L / 2, y + 30, {
    ukuran: spec.judul.length > 34 ? 40 : 46,
    warna: WARNA.navy,
    maksKar: spec.judul.length > 34 ? 34 : 30,
    maksBaris: 2,
    jarak: 48,
    tebal: 900,
    anchor: "middle",
  });
  bagian.push(judul.svg);
  y += judul.tinggi + 6;

  const barisAtas = [spec.tanggal, spec.subjudul].filter(Boolean).join("  |  ");
  if (barisAtas) {
    const t = teks(barisAtas, L / 2, y + 6, {
      ukuran: 17,
      warna: WARNA.merah,
      maksKar: 84,
      maksBaris: 2,
      jarak: 24,
      tebal: 700,
      anchor: "middle",
    });
    bagian.push(t.svg);
    y += t.tinggi + 4;
  }
  if (spec.catatanAtas) {
    const t = teks(spec.catatanAtas, L / 2, y + 8, {
      ukuran: 15,
      warna: WARNA.tintaKedua,
      maksKar: 92,
      maksBaris: 1,
      italic: true,
      anchor: "middle",
    });
    bagian.push(t.svg);
    y += t.tinggi + 6;
  }

  // kategori + status ancaman (warna selalu berpasangan label)
  bagian.push(
    `<rect x="${M}" y="${y + 4}" width="150" height="26" rx="13" fill="${WARNA.navy}"/>`,
    `<text x="${M + 75}" y="${y + 22}" font-size="12.5" font-weight="800" fill="#ffffff" ` +
      `letter-spacing="1" text-anchor="middle">${esc(spec.kategori.toUpperCase())}</text>`
  );
  if (spec.ancaman !== "tidak ada") {
    const wa = WARNA.status[spec.ancaman] || WARNA.redup;
    bagian.push(
      `<circle cx="${L - M - 152}" cy="${y + 17}" r="6" fill="${wa}"/>`,
      `<text x="${L - M - 140}" y="${y + 22}" font-size="12.5" font-weight="800" fill="${wa}" ` +
        `letter-spacing="1">ANCAMAN ${esc(spec.ancaman.toUpperCase())}</text>`
    );
  }
  y += 46;

  // --- kartu statistik ---
  if (spec.statistik.length) {
    const n = spec.statistik.length;
    const jarak = 14;
    const lebar = Math.floor((W - jarak * (n - 1)) / n);
    const tinggi = 96;
    spec.statistik.forEach((s, i) => {
      const x = M + i * (lebar + jarak);
      const warnaNilai = i % 2 === 0 ? WARNA.navy : WARNA.merah;
      const ukuranNilai = s.nilai.length > 6 ? 28 : s.nilai.length > 3 ? 36 : 44;
      bagian.push(
        `<rect x="${x}" y="${y}" width="${lebar}" height="${tinggi}" rx="10" ` +
          `fill="${WARNA.permukaan}" stroke="${WARNA.navy}" stroke-width="2"/>`,
        `<text x="${x + 20}" y="${y + 48}" font-size="${ukuranNilai}" font-weight="900" ` +
          `fill="${warnaNilai}">${esc(s.nilai)}</text>`
      );
      if (s.satuan) {
        const lebarNilai = s.nilai.length * ukuranNilai * 0.58;
        bagian.push(
          `<text x="${x + 26 + lebarNilai}" y="${y + 48}" font-size="15" font-weight="700" ` +
            `fill="${WARNA.tintaKedua}">${esc(s.satuan)}</text>`
        );
      }
      bagian.push(
        teks(s.label, x + 20, y + 72, {
          ukuran: 13,
          warna: WARNA.tintaKedua,
          maksKar: Math.floor(lebar / 7),
          maksBaris: 2,
          jarak: 16,
          tebal: 500,
        }).svg
      );
    });
    y += tinggi + 18;
  }

  // --- segmen peringkat + panel sorotan (dua kolom) ---
  if (spec.peringkat.length || spec.sorotan.length) {
    const punyaSorotan = spec.sorotan.length > 0;
    const lebarKiri = punyaSorotan ? Math.floor(W * 0.63) : W;
    const lebarKanan = W - lebarKiri - 14;
    const yAwal = y;

    // kolom kiri: daftar berperingkat + batang
    let yKiri = y;
    if (spec.peringkat.length) {
      bagian.push(kepalaSegmen(spec.peringkatJudul || "DATA UTAMA", M, yKiri, lebarKiri));
      yKiri += 54;

      const maks = Math.max(...spec.peringkat.map((p) => p.nilai), 1);
      // Kolom nama mengikuti nama terpanjang: dipatok lebar tetap, nama panjang
      // seperti "iNews Network" menabrak batangnya.
      const lebarNama = Math.max(
        ...spec.peringkat.map((p) => p.nama.length * 9.2),
        90
      );
      const xBar = Math.min(M + 52 + lebarNama, M + lebarKiri - 200);
      const lebarBarMaks = M + lebarKiri - 96 - xBar;
      spec.peringkat.forEach((p, i) => {
        const lebarBar = Math.max(8, Math.round((p.nilai / maks) * lebarBarMaks));
        bagian.push(
          `<circle cx="${M + 18}" cy="${yKiri + 9}" r="12" fill="${WARNA.navy}"/>`,
          `<text x="${M + 18}" y="${yKiri + 14}" font-size="13" font-weight="800" fill="#ffffff" ` +
            `text-anchor="middle">${i + 1}</text>`,
          `<text x="${M + 40}" y="${yKiri + 15}" font-size="17" font-weight="800" ` +
            `fill="${WARNA.tinta}">${esc(p.nama)}</text>`,
          `<rect x="${xBar}" y="${yKiri + 1}" width="${lebarBar}" height="17" rx="3" fill="${WARNA.biru}"/>`,
          `<text x="${xBar + lebarBar + 10}" y="${yKiri + 15}" font-size="17" font-weight="800" ` +
            `fill="${WARNA.navy}">${p.nilai}</text>`,
          `<text x="${xBar + lebarBar + 16 + String(p.nilai).length * 10}" y="${yKiri + 15}" ` +
            `font-size="12.5" fill="${WARNA.redup}">${esc(p.satuan)}</text>`
        );
        yKiri += 26;
        if (p.fokus) {
          const f = teks(`Fokus: ${p.fokus}`, M + 40, yKiri + 12, {
            ukuran: 12.5,
            warna: WARNA.tintaKedua,
            maksKar: Math.floor((lebarKiri - 60) / 6.2),
            maksBaris: 3,
            jarak: 17,
          });
          bagian.push(f.svg);
          yKiri += f.tinggi + 6;
        }
        if (i < spec.peringkat.length - 1) {
          bagian.push(
            `<line x1="${M + 12}" y1="${yKiri}" x2="${M + lebarKiri - 12}" y2="${yKiri}" ` +
              `stroke="${WARNA.garis}" stroke-width="1" stroke-dasharray="3 3"/>`
          );
          yKiri += 12;
        }
      });
      yKiri += 8;
    }

    // kolom kanan: panel sorotan
    let yKanan = yAwal;
    if (punyaSorotan) {
      const xK = M + lebarKiri + 14;
      const isiPanel: string[] = [];
      let yy = yAwal + 62;
      for (const s of spec.sorotan) {
        const t = teks(s, xK + 34, yy, {
          ukuran: 13.5,
          warna: WARNA.tinta,
          maksKar: Math.floor((lebarKanan - 52) / 6.4),
          maksBaris: 5,
          jarak: 18,
          tebal: 500,
        });
        isiPanel.push(`<circle cx="${xK + 20}" cy="${yy - 5}" r="4.5" fill="${WARNA.merah}"/>`, t.svg);
        yy += t.tinggi + 12;
      }
      const tinggiPanel = yy - yAwal - 4;
      bagian.push(
        `<rect x="${xK}" y="${yAwal}" width="${lebarKanan}" height="${tinggiPanel}" rx="10" ` +
          `fill="#fdf3f3" stroke="${WARNA.merah}" stroke-width="2"/>`,
        `<path d="M ${xK} ${yAwal + 10} a 10 10 0 0 1 10 -10 h ${lebarKanan - 20} a 10 10 0 0 1 10 10 v 30 h -${lebarKanan} z" ` +
          `fill="${WARNA.merah}"/>`,
        `<text x="${xK + lebarKanan / 2}" y="${yAwal + 27}" font-size="14.5" font-weight="800" ` +
          `fill="#ffffff" letter-spacing="1" text-anchor="middle">${esc(
            spec.sorotanJudul || "SOROTAN"
          )}</text>`,
        ...isiPanel
      );
      yKanan = yAwal + tinggiPanel;
    }

    y = Math.max(yKiri, yKanan) + 18;
  }

  // --- segmen kartu entitas ---
  if (spec.entitas.length) {
    bagian.push(kepalaSegmen(spec.entitasJudul || "KELOMPOK & TOKOH", M, y, W));
    y += 54;

    const n = spec.entitas.length;
    const jarak = 14;
    const lebar = Math.floor((W - jarak * (n - 1)) / n);
    const warnaKartu = [WARNA.navy, WARNA.merah, WARNA.hijau];
    let tinggiMaks = 0;
    const isiKartu: string[] = [];

    spec.entitas.forEach((e, i) => {
      const x = M + i * (lebar + jarak);
      const w = warnaKartu[i % warnaKartu.length];
      let yy = y + 38;

      isiKartu.push(
        `<text x="${x + lebar / 2}" y="${yy}" font-size="26" font-weight="900" fill="${w}" ` +
          `text-anchor="middle">${esc(e.nama)}</text>`
      );
      yy += 6;
      if (e.subjudul) {
        const t = teks(e.subjudul, x + lebar / 2, yy + 14, {
          ukuran: 13,
          warna: WARNA.tintaKedua,
          maksKar: Math.floor(lebar / 6.6),
          maksBaris: 2,
          jarak: 17,
          italic: true,
          anchor: "middle",
        });
        isiKartu.push(t.svg);
        yy += t.tinggi + 10;
      }
      if (e.tokoh) {
        const t = teks(`Tokoh: ${e.tokoh}`, x + lebar / 2, yy + 16, {
          ukuran: 13.5,
          warna: WARNA.navy,
          maksKar: Math.floor(lebar / 6.4),
          maksBaris: 2,
          jarak: 18,
          tebal: 700,
          anchor: "middle",
        });
        isiKartu.push(
          `<line x1="${x + 16}" y1="${yy + 2}" x2="${x + lebar - 16}" y2="${yy + 2}" ` +
            `stroke="${WARNA.garis}" stroke-width="1"/>`,
          t.svg
        );
        yy += t.tinggi + 14;
      }
      for (const b of e.butir) {
        const t = teks(b, x + 34, yy + 9, {
          ukuran: 12.5,
          warna: WARNA.tintaKedua,
          maksKar: Math.floor((lebar - 48) / 6),
          maksBaris: 3,
          jarak: 16,
        });
        isiKartu.push(
          `<circle cx="${x + 20} " cy="${yy + 4}" r="7" fill="${w}"/>`,
          `<path d="M ${x + 16.5} ${yy + 4} l 2.5 2.5 l 4.5 -5" stroke="#ffffff" ` +
            `stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
          t.svg
        );
        yy += t.tinggi + 8;
      }
      if (e.catatan) {
        const t = teks(e.catatan, x + 26, yy + 24, {
          ukuran: 12,
          warna: WARNA.tintaKedua,
          maksKar: Math.floor((lebar - 44) / 5.8),
          maksBaris: 3,
          jarak: 16,
          italic: true,
        });
        isiKartu.push(
          `<rect x="${x + 12}" y="${yy + 8}" width="${lebar - 24}" height="${t.tinggi + 16}" ` +
            `rx="7" fill="${WARNA.papan}"/>`,
          t.svg
        );
        yy += t.tinggi + 28;
      }
      tinggiMaks = Math.max(tinggiMaks, yy - y + 8);
    });

    // Bingkai digambar lebih dulu supaya semua kartu setinggi yang terpanjang.
    spec.entitas.forEach((_, i) => {
      const x = M + i * (lebar + jarak);
      const w = warnaKartu[i % warnaKartu.length];
      bagian.push(
        `<rect x="${x}" y="${y}" width="${lebar}" height="${tinggiMaks}" rx="10" ` +
          `fill="${WARNA.permukaan}" stroke="${w}" stroke-width="2"/>`
      );
    });
    bagian.push(...isiKartu);
    y += tinggiMaks + 18;
  }

  // --- catatan tambahan ---
  if (spec.catatan.length) {
    bagian.push(kepalaSegmen("CATATAN TAMBAHAN", M, y, W));
    y += 52;
    for (const c of spec.catatan) {
      const t = teks(c, M + 34, y + 12, {
        ukuran: 13.5,
        warna: WARNA.tintaKedua,
        maksKar: 118,
        maksBaris: 3,
        jarak: 19,
      });
      bagian.push(`<circle cx="${M + 18}" cy="${y + 7}" r="4.5" fill="${WARNA.navy}"/>`, t.svg);
      y += t.tinggi + 12;
    }
    y += 8;
  }

  // --- kaki ---
  const tgl = tanggal.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const T = Math.max(1350, y + 76);
  bagian.push(
    `<rect x="${M}" y="${T - 76}" width="${W}" height="34" rx="6" fill="${WARNA.navy}"/>`,
    `<text x="${M + 18}" y="${T - 54}" font-size="13" font-weight="600" fill="#ffffff">Sumber: ${esc(
      spec.sumber
    )}</text>`,
    `<text x="${M + W - 18}" y="${T - 54}" font-size="13" fill="#c9d4e6" text-anchor="end">Disusun ${esc(
      tgl
    )} · mbahna</text>`,
    `<rect x="0" y="${T - 26}" width="${L}" height="26" fill="${warnaKlas}"/>`,
    `<text x="${L / 2}" y="${T - 8}" font-size="12" font-weight="800" fill="#ffffff" ` +
      `letter-spacing="3" text-anchor="middle">${esc(spec.klasifikasi)}</text>`
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${T}" viewBox="0 0 ${L} ${T}" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif">
<rect width="${L}" height="${T}" fill="${WARNA.permukaan}"/>
${bagian.join("\n")}
</svg>`;
}
