import { runWeb, extractJson } from "./web";
import { getCache, setCache } from "./cache";

export type Actor = { nama: string; peran: string; afiliasi: string };
export type ChronoItem = { waktu: string; peristiwa: string };
export type RelatedSource = { title: string; url: string; source: string };

export type Dossier = {
  image: string; // URL foto representatif (og:image/thumbnail)
  headline: string;
  ringkasan: string;
  skorAlasan: string; // kenapa isu ini panas / kenapa skor suhu setinggi itu
  kredibilitas: string; // kredibel | perlu_verifikasi | terindikasi_hoaks
  verifikasi: string; // alasan penilaian kredibilitas / hasil cek fakta
  status: string; // berkembang | stabil | mereda
  urgency: number; // 0-3
  kategori: string;
  sentiment: "positive" | "negative" | "neutral";
  threat: string; // none | makar | separatisme | terorisme | radikalisme | disintegrasi
  threatLevel: number; // 0-3
  aktor: Actor[];
  organisasi: string[];
  lokasi: string[];
  kronologi: ChronoItem[];
  faktaKunci: string[];
  reaksiPublik: string;
  implikasi: string[];
  rekomendasiPantau: string[];
  sumberTerkait: RelatedSource[];
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
(dossier) monitoring yang berguna untuk tim intel — fokus politik/pemerintahan/keamanan Indonesia.

Isi berkas (Bahasa Indonesia, faktual, netral, hanya dari sumber kredibel):
- image: URL foto/gambar representatif dari berita (og:image atau thumbnail artikel). Kosongkan bila tak ada.
- headline: judul ringkas
- ringkasan: 2-3 kalimat situasi
- kredibilitas: nilai keaslian berita -> "kredibel" | "perlu_verifikasi" | "terindikasi_hoaks".
  Dasar penilaian: apakah dikonfirmasi sumber resmi/otoritas, konsisten di banyak media kredibel,
  ada bantahan/klarifikasi, atau ada catatan cek fakta (Kominfo, Mafindo/TurnBackHoax, AFP, dll),
  serta ciri hoaks (sumber anonim, klaim tanpa bukti, foto/tanggal manipulatif, judul provokatif).
- verifikasi: 1-2 kalimat alasan penilaian kredibilitas di atas (sebut dasar/temuannya).
- skor_alasan: jelaskan KENAPA isu ini panas/penting. Bila konteks memberi skor suhu (heat 0-100),
  jelaskan spesifik alasan skor setinggi/serendah itu: faktor pendorong, volume & intensitas pemberitaan,
  jumlah aktor terlibat, potensi eskalasi.
- status: "berkembang" | "stabil" | "mereda"
- urgency: 0-3 (tingkat perhatian tim intel)
- kategori: bidang isu
- sentiment: positive|negative|neutral (nada pemberitaan)
- threat: none|makar|separatisme|terorisme|radikalisme|disintegrasi (ancaman kedaulatan; none bila bukan).
  Kelompok terkait -> separatisme: OPM/TPNPB/KKB Papua/ULMWP/GAM/RMS; terorisme/radikalisme: JI/JAD/NII/MIT/Khilafatul Muslimin/eks-HTI/ISIS.
- threat_level: 0-3
- aktor: tokoh/pihak terlibat [{nama, peran, afiliasi}]
- organisasi: lembaga/organisasi terkait
- lokasi: tempat relevan
- kronologi: urutan peristiwa [{waktu, peristiwa}]
- fakta_kunci: poin-poin fakta penting
- reaksi_publik: ringkasan respons publik/media sosial
- implikasi: potensi dampak politik/keamanan
- rekomendasi_pantau: hal yang perlu dipantau/tindak lanjut tim intel
- sumber_terkait: [{title, url, source}] 3-6 link berita relevan (URL asli bisa dibuka, fokus 7 hari terakhir)

Keluarkan HANYA JSON valid tanpa penjelasan lain, bentuk:
{
  "image":"", "headline":"", "ringkasan":"", "skor_alasan":"",
  "kredibilitas":"perlu_verifikasi", "verifikasi":"",
  "status":"berkembang", "urgency":0, "kategori":"",
  "sentiment":"neutral", "threat":"none", "threat_level":0,
  "aktor":[{"nama":"","peran":"","afiliasi":""}],
  "organisasi":[""], "lokasi":[""],
  "kronologi":[{"waktu":"","peristiwa":""}],
  "fakta_kunci":[""], "reaksi_publik":"",
  "implikasi":[""], "rekomendasi_pantau":[""],
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
    ringkasan: str(p.ringkasan),
    skorAlasan: str(p.skor_alasan),
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
    aktor: arr(p.aktor).map((a: any) => ({
      nama: str(a?.nama),
      peran: str(a?.peran),
      afiliasi: str(a?.afiliasi),
    })),
    organisasi: arr(p.organisasi).map(str).filter(Boolean),
    lokasi: arr(p.lokasi).map(str).filter(Boolean),
    kronologi: arr(p.kronologi).map((k: any) => ({
      waktu: str(k?.waktu),
      peristiwa: str(k?.peristiwa),
    })),
    faktaKunci: arr(p.fakta_kunci).map(str).filter(Boolean),
    reaksiPublik: str(p.reaksi_publik),
    implikasi: arr(p.implikasi).map(str).filter(Boolean),
    rekomendasiPantau: arr(p.rekomendasi_pantau).map(str).filter(Boolean),
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
    `Susun dossier monitoring intel.\nSubjek: "${title}"\n` +
      (url ? `URL berita: ${url}\n` : "") +
      (opts.context ? `Konteks: ${opts.context}\n` : "") +
      `Ambil isi/konteks dari web lalu keluarkan JSON.`,
    7000
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
