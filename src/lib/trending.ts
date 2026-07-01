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

export type CityItem = {
  kota: string; // kota/kabupaten
  provinsi: string;
  headline: string;
  summary: string;
  heat: number; // 0-100
  sentiment: "positive" | "negative" | "neutral";
  url: string;
  source: string;
  platform: string;
  lat: number;
  lon: number;
};

export type TrendingResult = {
  date: string;
  generatedAt: number;
  cached: boolean;
  topics: TrendTopic[];
  cities: CityItem[];
};

const CACHE_MS = 60 * 60 * 1000; // segar 1 jam; berita baru muncul tiap jam / ganti hari
const CACHE_KEY = "intel";

function today(): string {
  // Tanggal WIB (UTC+7) supaya "hari ini" sesuai waktu Indonesia.
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
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

2) "cities" — berita politik/pemerintahan menonjol PER KOTA/KABUPATEN (TEPAT 8 kota/kabupaten,
   tidak kurang tidak lebih; mis. Jakarta Pusat, Kota Bandung, Kabupaten Bogor, Surabaya,
   Kota Semarang, Makassar, Medan, Jayapura, Banda Aceh, dll — spesifik kota/kabupaten, BUKAN provinsi):
   - RENTANG WAKTU: berita yang terbit dalam 3 HARI TERAKHIR (hari ini sampai H-3). Buang yang lebih lama.
   - Tiap kota/kabupaten: 1 headline politik/pemerintahan lokal paling penting & terbaru.
   - "kota" (nama kota/kabupaten), "provinsi" (induknya), "heat" 0-100, "sentiment",
     ringkasan singkat, URL + sumber + platform.
   - "lat" & "lon": KOORDINAT kota/kabupaten tsb (desimal, mis. Jakarta lat -6.2 lon 106.8).

Batasan: ABAIKAN hiburan/olahraga/teknologi konsumen kecuali berkaitan langsung dengan
kebijakan/pejabat/pemerintah.

Keluarkan HANYA JSON valid, tanpa penjelasan, bentuk:
{
  "topics": [
    { "topic":"", "category":"politik", "heat":0, "summary":"", "sentiment":"neutral",
      "threat":"none", "threat_level":0, "breaking":false,
      "sources":[{"title":"","url":"","source":"","platform":"news","published":""}] }
  ],
  "cities": [
    { "kota":"Kota Bandung", "provinsi":"Jawa Barat", "headline":"", "summary":"", "heat":0,
      "sentiment":"neutral", "url":"", "source":"", "platform":"news", "lat":-6.9, "lon":107.6 }
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

function parse(text: string): { topics: TrendTopic[]; cities: CityItem[] } {
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

  const cities: CityItem[] = (Array.isArray(parsed.cities) ? parsed.cities : [])
    .filter((p: any) => p && p.kota)
    .map((p: any) => ({
      kota: String(p.kota || ""),
      provinsi: String(p.provinsi || ""),
      headline: String(p.headline || ""),
      summary: String(p.summary || ""),
      heat: heatOf(p.heat),
      sentiment: sentOf(p.sentiment),
      url: String(p.url || ""),
      source: String(p.source || ""),
      platform: String(p.platform || "web"),
      lat: Number(p.lat),
      lon: Number(p.lon),
    }))
    .sort((a: CityItem, b: CityItem) => b.heat - a.heat);

  return { topics, cities };
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
      `10 topik nasional dan TEPAT 8 kota/kabupaten (dengan lat/lon, berita 3 hari terakhir). Sertakan sumber asli + tanggal terbit. ` +
      `Breaking (breaking:true) HANYA untuk berita yang TERBIT tanggal ${today()} (00:00-23:59); ` +
      `berita hari lain breaking:false. ` +
      `PENTING: pastikan JSON valid dan LENGKAP sampai kurung tutup terakhir, jangan terpotong.`,
    12000
  );
  const { topics, cities } = parse(text);
  const result: TrendingResult = {
    date: today(),
    generatedAt: Date.now(),
    cached: false,
    topics,
    cities,
  };
  // Hanya cache kalau ada isinya.
  if (topics.length > 0) setCache<TrendingResult>(CACHE_KEY, "intel", result);
  return result;
}
