import { runWeb, extractJson } from "./web";
import { getCache, setCache } from "./cache";

export type RelatedSource = {
  title: string;
  url: string;
  source: string;
  published: string; // ISO 8601 — dipakai menyaring berita lintas tahun
};
export type Lokasi = { nama: string; lat: number; lon: number };
export type Actor = { nama: string; peran: string; afiliasi: string };

export type Dossier = {
  image: string;
  headline: string;
  tanggalBerita: string; // tanggal terbit berita utama (ISO 8601)
  kredibilitas: string; // kredibel | perlu_verifikasi | terindikasi_hoaks
  verifikasi: string;
  status: string; // berkembang | stabil | mereda
  urgency: number; // 0-3
  kategori: string;
  sentiment: "positive" | "negative" | "neutral";
  threat: string; // none | makar | separatisme | terorisme | radikalisme | disintegrasi
  threatLevel: number; // 0-3
  skorAlasan: string; // kenapa skor intensitas segitu (opsional)
  kronologiFakta: string; // narasi 5W+1H (kronologi + fakta kunci digabung)
  aktor: Actor[]; // tokoh/pihak terlibat
  organisasi: string[]; // lembaga/organisasi terkait
  penilaian: string; // judgement
  prakiraan: string; // forecasting
  solusi: string; // problem solving
  dampak: string; // dampak utk pemerintahan & Indonesia
  reaksiPublik: string; // respons publik/media sosial
  upayaTelah: string; // upaya yang telah dilakukan
  upayaBisa: string; // upaya yang bisa dilakukan
  implikasi: string[]; // potensi konsekuensi lanjutan
  rekomendasiPantau: string[]; // hal yang perlu dipantau
  saranTindakan: string[]; // yang harus dilakukan
  lokasi: Lokasi[]; // tempat kejadian + koordinat (link ke maps)
  sumberTerkait: RelatedSource[]; // OSINT berita terkait
};

export type DossierResult = {
  url: string;
  title: string;
  generatedAt: number;
  cached: boolean;
  dossier: Dossier;
};

const CACHE_MS = 24 * 60 * 60 * 1000;

const SYSTEM = `Kamu analis intelijen untuk tim monitoring badan intelijen negara Indonesia.
Diberikan satu berita (judul + URL). Ambil isi dan konteksnya dari web, lalu susun BERKAS
(dossier) analisis intelijen. Fokus politik/pemerintahan/keamanan Indonesia. Bahasa Indonesia,
faktual, netral, hanya dari sumber kredibel.

Isi berkas:
- image: URL foto/gambar representatif berita (og:image/thumbnail). Kosongkan bila tak ada.
- headline: judul ringkas.
- kredibilitas: "kredibel" | "perlu_verifikasi" | "terindikasi_hoaks" (dasar: konfirmasi sumber resmi,
  konsistensi lintas media, cek fakta Kominfo/Mafindo/TurnBackHoax, ciri hoaks).
- verifikasi: 1-2 kalimat alasan penilaian kredibilitas.
- status: "berkembang" | "stabil" | "mereda". urgency: 0-3. kategori: bidang isu.
- sentiment: positive|negative|neutral. threat: none|makar|separatisme|terorisme|radikalisme|disintegrasi
  (kelompok: OPM/TPNPB/KKB/GAM/RMS=separatisme; JI/JAD/NII/MIT/Khilafatul Muslimin/ISIS=terorisme). threat_level: 0-3.
- skor_alasan: kenapa isu ini penting/panas (boleh singkat).
- kronologi_fakta: NARASI KRONOLOGIS berformat 5W+1H (Siapa, Apa, Kapan, Di mana, Mengapa, Bagaimana),
  MENGGABUNGKAN urutan peristiwa + fakta-fakta kunci menjadi 1-3 paragraf yang mengalir (bukan poin-poin).
  Contoh gaya: "Pada 1 Januari 2025, pemerintah menerapkan PPN 12% untuk barang mewah sesuai UU HPP,
  sementara barang pokok tetap 11%. Untuk meredam dampak, pemerintah meluncurkan 15 insentif. Presiden
  Prabowo juga menandatangani PP No. 47/2024 yang menghapus piutang macet UMKM, disambut positif berbagai pihak."
- aktor: tokoh/pihak yang terlibat [{nama, peran, afiliasi}].
- organisasi: lembaga/organisasi terkait (array string).
- penilaian: PENILAIAN intelijen (judgement) atas situasi.
- prakiraan: PRAKIRAAN (forecasting) — kemungkinan perkembangan ke depan.
- solusi: PROBLEM SOLVING — pendekatan penyelesaian.
- dampak: dampak konkret terhadap PEMERINTAHAN dan INDONESIA (politik, keamanan, ekonomi, sosial).
- reaksi_publik: ringkasan respons publik / media sosial.
- upaya_telah: upaya yang SUDAH dilakukan pihak terkait.
- upaya_bisa: upaya yang BISA/SEHARUSNYA dilakukan (mis. menjaga citra pemerintah, peran lembaga seperti BIN).
- implikasi: array potensi konsekuensi lanjutan.
- rekomendasi_pantau: array hal yang perlu dipantau / tindak lanjut tim intel.
- saran_tindakan: array tindakan yang HARUS dilakukan (mis. koordinasi dengan kementerian/lembaga terkait,
  pemantauan lanjutan, langkah mitigasi).
- lokasi: TEPAT SATU tempat, yaitu TEMPAT KEJADIAN PERKARA (TKP) sesuai JUDUL berita — bukan daftar
  semua tempat yang disebut. Contoh: berita kebakaran -> bangunan/pabrik yang terbakar; berita bentrok ->
  titik bentrokan; berita OTT -> lokasi penangkapan; berita sidang -> gedung pengadilannya. Bila berita
  menyebut banyak tempat, pilih SATU yang paling menjadi pusat peristiwa.
  Bentuk: [{nama, lat, lon}] berisi satu item. "nama" harus SPESIFIK & bisa dicari di peta (nama tempat +
  kelurahan/kota, mis. "PT Raw Botanical Nusantara, Ngaliyan, Kota Semarang") — jangan hanya nama provinsi
  atau negara. Koordinat seakurat mungkin (boleh 0 bila ragu — peta memakai nama).
  Kosongkan array bila peristiwanya memang tidak punya tempat kejadian spesifik.
- tanggal_berita: tanggal terbit berita UTAMA dalam ISO 8601 (mis. "2026-08-25"). Ambil dari halaman
  beritanya. Wajib diisi bila terbaca.
- sumber_terkait: 3-6 berita terkait (OSINT) — {title, url asli, source, published}.
  SEZAMAN dengan berita utama: hanya berita yang terbit dalam rentang 30 HARI sebelum atau sesudah
  tanggal berita utama. DILARANG mengambil berita dari tahun berbeda atau peristiwa lama yang kebetulan
  mirip topiknya — berita 2025 tidak boleh dipasang pada peristiwa 2026. "published" WAJIB diisi ISO 8601;
  bila tanggalnya tidak bisa dipastikan, JANGAN sertakan berita itu.
  Sertakan beragam media, tapi semuanya harus membahas peristiwa yang SAMA.

Keluarkan HANYA JSON valid tanpa penjelasan lain, bentuk:
{
  "image":"", "headline":"",
  "kredibilitas":"perlu_verifikasi", "verifikasi":"",
  "status":"berkembang", "urgency":0, "kategori":"", "sentiment":"neutral",
  "threat":"none", "threat_level":0, "skor_alasan":"",
  "kronologi_fakta":"",
  "aktor":[{"nama":"","peran":"","afiliasi":""}], "organisasi":[""],
  "penilaian":"", "prakiraan":"", "solusi":"",
  "dampak":"", "reaksi_publik":"", "upaya_telah":"", "upaya_bisa":"",
  "implikasi":[""], "rekomendasi_pantau":[""], "saran_tindakan":[""],
  "lokasi":[{"nama":"","lat":0,"lon":0}],
  "tanggal_berita":"",
  "sumber_terkait":[{"title":"","url":"","source":"","published":""}]
}`;

const sentOf = (s: any): "positive" | "negative" | "neutral" =>
  ["positive", "negative", "neutral"].includes(s) ? s : "neutral";
const arr = (x: any): any[] => (Array.isArray(x) ? x : []);
const str = (x: any) => String(x ?? "");
const clamp3 = (n: any) => Math.max(0, Math.min(3, Math.round(Number(n) || 0)));

function parse(text: string): Dossier {
  const p = extractJson(text) || {};
  return {
    image: str(p.image),
    headline: str(p.headline),
    tanggalBerita: str(p.tanggal_berita),
    kredibilitas: ["kredibel", "perlu_verifikasi", "terindikasi_hoaks"].includes(
      p.kredibilitas
    )
      ? p.kredibilitas
      : "perlu_verifikasi",
    verifikasi: str(p.verifikasi),
    status: str(p.status || "stabil"),
    urgency: clamp3(p.urgency),
    kategori: str(p.kategori),
    sentiment: sentOf(p.sentiment),
    threat: str(p.threat || "none"),
    threatLevel: clamp3(p.threat_level),
    skorAlasan: str(p.skor_alasan),
    kronologiFakta: str(p.kronologi_fakta),
    aktor: arr(p.aktor).map((a: any) => ({
      nama: str(a?.nama),
      peran: str(a?.peran),
      afiliasi: str(a?.afiliasi),
    })).filter((a: Actor) => a.nama),
    organisasi: arr(p.organisasi).map(str).filter(Boolean),
    penilaian: str(p.penilaian),
    prakiraan: str(p.prakiraan),
    solusi: str(p.solusi),
    dampak: str(p.dampak),
    reaksiPublik: str(p.reaksi_publik),
    upayaTelah: str(p.upaya_telah),
    upayaBisa: str(p.upaya_bisa),
    implikasi: arr(p.implikasi).map(str).filter(Boolean),
    rekomendasiPantau: arr(p.rekomendasi_pantau).map(str).filter(Boolean),
    saranTindakan: arr(p.saran_tindakan).map(str).filter(Boolean),
    lokasi: arr(p.lokasi)
      .map((l: any) => ({
        nama: str(l?.nama),
        lat: Number(l?.lat),
        lon: Number(l?.lon),
      }))
      .filter(
        (l: Lokasi) =>
          l.nama && Number.isFinite(l.lat) && Number.isFinite(l.lon)
      )
      // Hanya TKP utama yang dipakai; sisanya dibuang supaya peta menunjuk
      // satu titik, bukan sebaran tempat yang kebetulan disebut berita.
      .slice(0, 1),
    sumberTerkait: saringSezaman(
      arr(p.sumber_terkait)
        .filter((s: any) => s?.url)
        .map((s: any) => ({
          title: str(s?.title),
          url: str(s?.url),
          source: str(s?.source),
          published: str(s?.published),
        })),
      str(p.tanggal_berita)
    ),
  };
}

// Berita terkait harus membahas peristiwa yang sama, jadi tanggalnya tidak
// boleh melenceng jauh dari berita utama. Patokan: 30 hari. Bila tanggal berita
// utama tidak terbaca, dipakai hari ini sebagai acuan.
const RENTANG_TERKAIT_HARI = 30;

function saringSezaman(daftar: RelatedSource[], tanggalUtama: string): RelatedSource[] {
  const acuan = Date.parse(tanggalUtama) || Date.now();
  const layak = daftar.filter((s) => {
    const t = Date.parse(s.published);
    if (Number.isNaN(t)) return false; // tanpa tanggal -> tak bisa dibuktikan sezaman
    return Math.abs(acuan - t) / 86400000 <= RENTANG_TERKAIT_HARI;
  });
  // Kalau penyaringan menyisakan terlalu sedikit, tampilkan apa adanya daripada
  // kehilangan seluruh rujukan — tetapi buang yang beda tahun.
  if (layak.length >= 2) return layak;
  const tahunAcuan = new Date(acuan).getFullYear();
  return daftar.filter((s) => {
    const t = Date.parse(s.published);
    if (Number.isNaN(t)) return true;
    return new Date(t).getFullYear() === tahunAcuan;
  });
}

export async function getDossier(
  url: string,
  title: string,
  opts: { fresh?: boolean; context?: string; keyExtra?: string } = {}
): Promise<DossierResult> {
  const key = "dossier:" + (url || title) + (opts.keyExtra ? "#" + opts.keyExtra : "");
  if (!opts.fresh) {
    const cached = getCache<DossierResult>(key, CACHE_MS);
    if (cached) return { ...cached.data, cached: true };
  }

  const text = await runWeb(
    SYSTEM,
    `Susun dossier analisis intel.\nSubjek: "${title}"\n` +
      (url ? `URL berita: ${url}\n` : "") +
      (opts.context ? `Konteks: ${opts.context}\n` : "") +
      `Ambil isi/konteks dari web lalu keluarkan JSON.`,
    8000,
    "dossier"
  );
  const dossier = parse(text);
  const result: DossierResult = {
    url,
    title,
    generatedAt: Date.now(),
    cached: false,
    dossier,
  };
  setCache<DossierResult>(key, url, result);
  return result;
}
