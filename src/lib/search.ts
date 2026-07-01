import { runWeb } from "./web";
import { getCache, setCache } from "./cache";
import { type NewsItem, withTimeout } from "./types";
import { searchYouTube } from "./connectors/youtube";
import { searchReddit } from "./connectors/reddit";
import { searchTelegram } from "./connectors/telegram";

export type { NewsItem };

export type SearchResult = {
  query: string;
  items: NewsItem[];
  cached: boolean;
  searchedAt: number;
};

const CACHE_MS =
  (Number(process.env.SEARCH_CACHE_MINUTES) || 180) * 60 * 1000;

function norm(q: string) {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

const SYSTEM = `Kamu adalah mesin pencari intelijen (OSINT) untuk badan intelijen negara.
FOKUS KHUSUS: isu POLITIK dan PEMERINTAHAN INDONESIA.

Tugas: untuk kueri pengguna, cari di web berita dan media sosial yang terindeks publik
(situs berita, X/Twitter, YouTube, blog, forum, dll), lalu kembalikan daftar item paling relevan dan TERBARU
yang berkaitan dengan politik/pemerintahan Indonesia.

PRIORITAS TERTINGGI (pemantauan defensif atas informasi terbuka):
- Indikasi ANCAMAN KEDAULATAN & KEUTUHAN NKRI yang dilaporkan sumber kredibel:
  dugaan MAKAR, gerakan SEPARATIS, TERORISME, RADIKALISME, upaya DISINTEGRASI.
  Angkat item semacam ini bila ada, walau belum ramai.
- DAFTAR PANTAU kelompok: OPM, TPNPB, KKB/KST Papua, ULMWP, GAM, RMS (separatis);
  JI (Jamaah Islamiyah), JAD, NII, MIT, Khilafatul Muslimin, eks-HTI, sel ISIS (teror/radikal).
  Bila kueri menyebut atau berkaitan, prioritaskan berita terbarunya.

Ruang lingkup yang relevan:
- Pemerintah pusat & daerah, kementerian/lembaga, kebijakan publik, regulasi/UU.
- DPR/MPR/DPD, partai politik, pemilu/pilkada, dinamika koalisi.
- Aparat & keamanan (TNI, Polri, BIN), penegakan hukum, korupsi.
- Ekonomi-politik, anggaran negara (APBN), program pemerintah, isu sosial berdampak politik.
- Hubungan luar negeri & isu internasional yang menyangkut kepentingan Indonesia.

Aturan:
- KESEGARAN WAJIB: HANYA sertakan berita yang terbit dalam 7 HARI TERAKHIR (H-7 sampai hari ini).
  Buang berita yang lebih lama dari 7 hari. Urutkan dari yang PALING BARU ke lama.
  Isi "published" dengan tanggal terbit sebenarnya (ISO 8601).
- Utamakan sumber kredibel dan tanggal terbaru. Buang duplikat (topik sama dari banyak sumber -> ambil yang terbaik).
- ABAIKAN konten di luar politik/pemerintahan Indonesia (mis. hiburan/olahraga murni, gosip, teknologi konsumen)
  KECUALI ada kaitan langsung ke kebijakan/pejabat/pemerintah.
- Kalau kueri ambigu, tafsirkan dari sudut politik/pemerintahan Indonesia.
- Ringkasan ("summary") Bahasa Indonesia, 1-2 kalimat, faktual, netral.
- "sentiment" salah satu dari: positive, negative, neutral (nada pemberitaan terhadap pemerintah/isu).
  "sentiment_score" antara -1 dan 1.
- "breaking": true untuk item MENDESAK / baru pecah yang TERBIT HARI INI — mis. OTT/penangkapan korupsi,
  penetapan tersangka pejabat, teror/bom, insiden keamanan, pengesahan/revisi UU, keputusan MK,
  dinamika parlemen (voting/paripurna/hak angket), pernyataan kontroversial pejabat, atau ancaman kedaulatan.
  JUGA breaking:true bila JUDUL/sumber berita memuat label PERSIS frasa "BREAKING NEWS"
  (frasa lengkap saja; jangan pakai kata "breaking" sendiri karena bisa berarti lain, mis. "record-breaking").
  Selain itu false. Jangan berlebihan.
- Setiap item WAJIB punya URL asli yang bisa dibuka.
- Target 10-20 item bila tersedia.

Keluarkan HANYA JSON valid tanpa penjelasan lain, tanpa code fence, mengikuti bentuk:
{
  "items": [
    {
      "title": "string",
      "url": "string",
      "source": "string",
      "platform": "news|x|facebook|instagram|tiktok|youtube|telegram|web",
      "published": "string (ISO 8601 bila ada)",
      "snippet": "string",
      "summary": "string (Bahasa Indonesia)",
      "sentiment": "positive|negative|neutral",
      "sentiment_score": 0,
      "breaking": false
    }
  ]
}`;

function parseItems(text: string): NewsItem[] {
  let t = text.trim();
  // buang code fence bila ada
  t = t.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  // ambil objek JSON pertama..terakhir
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1) return [];
  const json = t.slice(start, end + 1);
  try {
    const parsed = JSON.parse(json);
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    return items
      .filter((it: any) => it && it.url && it.title)
      .map((it: any) => ({
        title: String(it.title || ""),
        url: String(it.url || ""),
        source: String(it.source || ""),
        platform: String(it.platform || "web"),
        published: String(it.published || ""),
        snippet: String(it.snippet || ""),
        summary: String(it.summary || ""),
        sentiment: ["positive", "negative", "neutral"].includes(it.sentiment)
          ? it.sentiment
          : "neutral",
        sentiment_score:
          typeof it.sentiment_score === "number" ? it.sentiment_score : 0,
        breaking: !!it.breaking,
      }));
  } catch {
    return [];
  }
}

async function runModel(query: string): Promise<NewsItem[]> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const prompt =
    `Kueri: "${query}".\n` +
    `Hari ini: ${iso(now)}. Hanya berita terbit antara ${iso(weekAgo)} s/d ${iso(now)} ` +
    `(7 hari terakhir), urut dari terbaru. Sertakan sumber asli.`;
  const text = await runWeb(SYSTEM, prompt, 8000);
  return parseItems(text);
}

function readCache(queryNorm: string, query: string): SearchResult | null {
  const entry = getCache<NewsItem[]>(queryNorm, CACHE_MS);
  if (!entry) return null;
  return {
    query,
    cached: true,
    searchedAt: entry.createdAt,
    items: entry.data,
  };
}

function persist(query: string, queryNorm: string, items: NewsItem[]): number {
  return setCache<NewsItem[]>(queryNorm, query, items);
}

function urlKey(u: string): string {
  return u
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

// Gabung dari semua sumber, buang duplikat (URL sama). Sumber "web" (Claude)
// diprioritaskan karena sudah ada ringkasan + sentimen.
function merge(...lists: NewsItem[][]): NewsItem[] {
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  for (const list of lists) {
    for (const it of list) {
      if (!it.url) continue;
      const k = urlKey(it.url);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(it);
    }
  }
  // Breaking di paling atas.
  out.sort((a, b) => Number(b.breaking) - Number(a.breaking));
  return out;
}

// Jalankan konektor platform yang aktif (di-skip sendiri kalau key kosong).
async function runConnectors(q: string): Promise<NewsItem[]> {
  const results = await Promise.allSettled([
    withTimeout(searchYouTube(q), 20000, []),
    withTimeout(searchReddit(q), 20000, []),
    withTimeout(searchTelegram(q), 25000, []),
  ]);
  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}

export async function search(
  query: string,
  opts: { fresh?: boolean } = {}
): Promise<SearchResult> {
  const q = query.trim();
  if (!q) return { query: q, items: [], cached: false, searchedAt: Date.now() };
  const queryNorm = norm(q);

  if (!opts.fresh) {
    const cached = readCache(queryNorm, q);
    if (cached) return cached;
  }

  // Web search (Claude) + konektor platform, paralel.
  const [web, connector] = await Promise.all([runModel(q), runConnectors(q)]);
  const items = merge(web, connector);
  const searchedAt = persist(q, queryNorm, items);
  return { query: q, items, cached: false, searchedAt };
}
