import { runWeb, extractJson } from "./web";
import { getCache, setCache } from "./cache";

export type RelatedSource = { title: string; url: string; source: string };

export type Dossier = {
  image: string;
  headline: string;
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
  analisa: string; // judgement, forecasting, problem solving
  dampak: string; // dampak utk pemerintahan & Indonesia
  upaya: string; // yang telah / bisa dilakukan
  saranTindakan: string[]; // yang harus dilakukan
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
- analisa: analisis intelijen — PENILAIAN (judgement), PRAKIRAAN (forecasting), dan PROBLEM SOLVING.
- dampak: dampak konkret terhadap PEMERINTAHAN dan INDONESIA (politik, keamanan, ekonomi, sosial).
- upaya: upaya yang TELAH atau BISA dilakukan (mis. menjaga citra pemerintah, peran lembaga seperti BIN).
- saran_tindakan: array tindakan yang HARUS dilakukan (mis. koordinasi dengan kementerian/lembaga terkait,
  pemantauan lanjutan, langkah mitigasi).
- sumber_terkait: 3-6 berita terkait (OSINT) — {title, url asli, source}. Sertakan beragam media pendukung.

Keluarkan HANYA JSON valid tanpa penjelasan lain, bentuk:
{
  "image":"", "headline":"",
  "kredibilitas":"perlu_verifikasi", "verifikasi":"",
  "status":"berkembang", "urgency":0, "kategori":"", "sentiment":"neutral",
  "threat":"none", "threat_level":0, "skor_alasan":"",
  "kronologi_fakta":"", "analisa":"", "dampak":"", "upaya":"",
  "saran_tindakan":[""],
  "sumber_terkait":[{"title":"","url":"","source":""}]
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
    analisa: str(p.analisa),
    dampak: str(p.dampak),
    upaya: str(p.upaya),
    saranTindakan: arr(p.saran_tindakan).map(str).filter(Boolean),
    sumberTerkait: arr(p.sumber_terkait)
      .filter((s: any) => s?.url)
      .map((s: any) => ({
        title: str(s?.title),
        url: str(s?.url),
        source: str(s?.source),
      })),
  };
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
    8000
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
