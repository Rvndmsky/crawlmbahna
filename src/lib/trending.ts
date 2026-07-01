import { runWeb, extractJson } from "./web";
import { getCache, setCache } from "./cache";

export type TrendSource = {
  title: string;
  url: string;
  source: string;
  platform: string;
  published: string;
};

export type ThreatType =
  | "none"
  | "makar"
  | "separatisme"
  | "terorisme"
  | "radikalisme"
  | "disintegrasi";

export type TrendTopic = {
  topic: string;
  category: string; // politik|pemerintahan|hukum|korupsi|keamanan|pertahanan|pemilu|ekonomi|sosial|agama|ham|lingkungan|internasional|siber
  heat: number; // 0-100
  summary: string;
  sentiment: "positive" | "negative" | "neutral";
  threat: ThreatType; // jenis ancaman kedaulatan (none = bukan ancaman)
  threatLevel: number; // 0-3 (0=tidak ada, 3=kritis)
  breaking: boolean; // isu mendesak / baru pecah
  sources: TrendSource[];
};

export type ProvinceItem = {
  province: string;
  headline: string;
  summary: string;
  heat: number; // 0-100
  sentiment: "positive" | "negative" | "neutral";
  url: string;
  source: string;
  platform: string;
};

export type TrendingResult = {
  date: string;
  generatedAt: number;
  cached: boolean;
  topics: TrendTopic[];
  provinces: ProvinceItem[];
};

const CACHE_MS = 60 * 60 * 1000; // segar 1 jam; berita baru muncul tiap jam / ganti hari
const CACHE_KEY = "intel";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const SYSTEM = `Kamu analis intelijen untuk badan intelijen negara Indonesia.
FOKUS KHUSUS: isu POLITIK, PEMERINTAHAN, HUKUM, dan KEAMANAN Indonesia HARI INI.
Sumber: web berita & media sosial publik.

PRIORITAS TERTINGGI: deteksi indikasi ANCAMAN TERHADAP KEDAULATAN & KEUTUHAN NKRI
yang dilaporkan sumber publik — dugaan MAKAR, gerakan SEPARATIS, TERORISME, RADIKALISME,
atau upaya DISINTEGRASI bangsa. Tandai jelas item semacam ini. (Ini pemantauan defensif
atas informasi terbuka, bukan ajakan/aksi apa pun.)

DAFTAR PANTAU kelompok/isu (angkat bila ada pemberitaan terbaru):
- Papua: OPM, TPNPB, KKB/KST Papua, ULMWP -> threat "separatisme".
- Aceh: GAM & sisa-sisanya -> "separatisme". Maluku: RMS -> "separatisme".
- Teror/radikal: JI (Jamaah Islamiyah), JAD, NII, MIT, Khilafatul Muslimin, eks-HTI, sel ISIS -> "terorisme"/"radikalisme".
Cantumkan nama kelompoknya di "topic"/"summary" bila disebut sumber.

EFISIENSI: batasi pencarian web seperlunya (maksimal ~6-8 kali). Utamakan agregator berita
agar cepat. Jangan mencari satu per satu berlebihan.

Kembalikan DUA bagian:

1) "topics" — isu politik/pemerintahan nasional PALING HANGAT hari ini (TEPAT 10 topik):
   - Kelompokkan jadi TOPIK (gabung berita seisu). Bukan artikel tunggal.
   - "heat" 0-100 (seberapa ramai dibicarakan hari ini).
   - "category" pilih SATU yang PALING pas: politik, pemerintahan, hukum, korupsi, keamanan,
     pertahanan, pemilu, ekonomi, sosial, agama, ham, lingkungan, internasional, siber.
     (korupsi=kasus rasuah/KPK; pertahanan=TNI/alutsista; ham=hak asasi; lingkungan=SDA/agraria/tambang;
     siber=keamanan digital/serangan siber). Pilih yang paling spesifik, jangan asal "politik".
   - "summary" Bahasa Indonesia 1-2 kalimat, faktual, netral.
   - "sentiment": positive|negative|neutral (nada terhadap pemerintah/isu).
   - "threat": jenis ancaman kedaulatan -> salah satu: none, makar, separatisme, terorisme, radikalisme, disintegrasi.
     Isi selain "none" HANYA bila sumber kredibel memang melaporkan indikasi tersebut. Jangan mengada-ada.
   - "threat_level": 0-3 (0=bukan ancaman, 1=perlu dicatat, 2=serius, 3=kritis).
   - "breaking": true untuk isu MENDESAK / SINYAL AWAL yang butuh perhatian segera, mis.:
     * OTT/penangkapan korupsi (KPK/Kejaksaan), penetapan tersangka pejabat, operasi penegakan hukum.
     * Serangan/bom/teror, insiden keamanan, kerusuhan, bencana berdampak politik.
     * Pengesahan/revisi UU atau UUD, perubahan aturan/regulasi penting, keputusan MK.
     * Dinamika parlemen (DPR/MPR/DPD): voting, sidang paripurna, interpelasi, hak angket.
     * Pernyataan kontroversial/ngawur pejabat/tokoh publik yang memicu gejolak.
     * Ancaman kedaulatan/keamanan serius, atau info yang BARU terungkap & belum ramai.
     WAJIB: breaking:true HANYA untuk berita yang TERBIT HARI INI (tanggal yang diberikan, pukul 00:00-23:59
     waktu Indonesia). Berita kemarin atau sebelumnya => breaking:false walau penting. Cek tanggal terbit sumber.
     Tandai MINIMAL 5 topik yang PALING mendesak & TERBIT HARI INI sebagai breaking:true; sisanya false.
   - 2-4 "sources" (judul + URL asli + sumber + platform + tanggal).
   - Sertakan isu bermuatan ancaman kedaulatan bila ada hari ini, walau heat-nya belum tinggi.

2) "provinces" — berita politik/pemerintahan menonjol PER PROVINSI hari ini (6 provinsi
   yang PALING ada dinamika hari ini; pilih dari: DKI Jakarta, Jawa Barat, Jawa Tengah,
   Jawa Timur, Papua, Aceh, Sumatera Utara, Sulawesi Selatan, dll):
   - Tiap provinsi: 1 headline politik/pemerintahan lokal paling penting hari ini.
   - "heat" 0-100, "sentiment", ringkasan singkat, plus URL + sumber + platform.

Batasan: ABAIKAN hiburan/olahraga/teknologi konsumen kecuali berkaitan langsung dengan
kebijakan/pejabat/pemerintah.

Keluarkan HANYA JSON valid, tanpa penjelasan, bentuk:
{
  "topics": [
    { "topic":"", "category":"politik", "heat":0, "summary":"", "sentiment":"neutral",
      "threat":"none", "threat_level":0, "breaking":false,
      "sources":[{"title":"","url":"","source":"","platform":"news","published":""}] }
  ],
  "provinces": [
    { "province":"DKI Jakarta", "headline":"", "summary":"", "heat":0, "sentiment":"neutral",
      "url":"", "source":"", "platform":"news" }
  ]
}`;

const sentOf = (s: any): "positive" | "negative" | "neutral" =>
  ["positive", "negative", "neutral"].includes(s) ? s : "neutral";
const heatOf = (h: any) => Math.max(0, Math.min(100, Number(h) || 0));
const THREATS: ThreatType[] = [
  "none",
  "makar",
  "separatisme",
  "terorisme",
  "radikalisme",
  "disintegrasi",
];
const threatOf = (t: any): ThreatType =>
  THREATS.includes(t) ? t : "none";
const threatLvl = (n: any) => Math.max(0, Math.min(3, Math.round(Number(n) || 0)));

function parse(text: string): { topics: TrendTopic[]; provinces: ProvinceItem[] } {
  const parsed = extractJson(text) || {};

  const topics: TrendTopic[] = (Array.isArray(parsed.topics) ? parsed.topics : [])
    .filter((t: any) => t && t.topic)
    .map((t: any) => ({
      topic: String(t.topic || ""),
      category: String(t.category || "politik").toLowerCase(),
      heat: heatOf(t.heat),
      summary: String(t.summary || ""),
      sentiment: sentOf(t.sentiment),
      threat: threatOf(t.threat),
      threatLevel: threatLvl(t.threat_level),
      breaking: !!t.breaking,
      sources: (Array.isArray(t.sources) ? t.sources : [])
        .filter((s: any) => s && s.url && s.title)
        .map((s: any) => ({
          title: String(s.title || ""),
          url: String(s.url || ""),
          source: String(s.source || ""),
          platform: String(s.platform || "web"),
          published: String(s.published || ""),
        })),
    }))
    .sort((a: TrendTopic, b: TrendTopic) => b.heat - a.heat);

  const provinces: ProvinceItem[] = (
    Array.isArray(parsed.provinces) ? parsed.provinces : []
  )
    .filter((p: any) => p && p.province)
    .map((p: any) => ({
      province: String(p.province || ""),
      headline: String(p.headline || ""),
      summary: String(p.summary || ""),
      heat: heatOf(p.heat),
      sentiment: sentOf(p.sentiment),
      url: String(p.url || ""),
      source: String(p.source || ""),
      platform: String(p.platform || "web"),
    }))
    .sort((a: ProvinceItem, b: ProvinceItem) => b.heat - a.heat);

  return { topics, provinces };
}

export async function getTrending(
  opts: { fresh?: boolean } = {}
): Promise<TrendingResult> {
  if (!opts.fresh) {
    const cached = getCache<TrendingResult>(CACHE_KEY, CACHE_MS);
    // Abaikan cache kosong (hasil gagal parse) -> tarik ulang.
    if (
      cached &&
      cached.data.date === today() &&
      cached.data.topics.length > 0
    ) {
      return { ...cached.data, cached: true };
    }
  }

  const text = await runWeb(
    SYSTEM,
    `Tanggal HARI INI: ${today()}. Berikan peta intelijen isu politik & pemerintahan Indonesia: ` +
      `10 topik nasional dan berita 6 provinsi. Sertakan sumber asli + tanggal terbit. ` +
      `Breaking (breaking:true) HANYA untuk berita yang TERBIT tanggal ${today()} (00:00-23:59); ` +
      `berita hari lain breaking:false. ` +
      `PENTING: pastikan JSON valid dan LENGKAP sampai kurung tutup terakhir, jangan terpotong.`,
    12000
  );
  const { topics, provinces } = parse(text);
  const result: TrendingResult = {
    date: today(),
    generatedAt: Date.now(),
    cached: false,
    topics,
    provinces,
  };
  // Hanya cache kalau ada isinya.
  if (topics.length > 0) setCache<TrendingResult>(CACHE_KEY, "intel", result);
  return result;
}
