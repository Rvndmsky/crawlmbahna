import { runWeb, extractJson } from "./web";
import { getCache, setCache } from "./cache";
import { normName } from "./targets";
import { getFbPosts, type FbRawPost } from "./fbstore";

// Mesin pemantauan MEDIA SOSIAL per ORANG (individu) — terpisah dari /search
// yang fokus berita. Cakupan tahap ini SENGAJA dibatasi 3 platform tempat
// influencer/tokoh paling aktif: THREADS, INSTAGRAM, X (Twitter).
// Sumber hanya konten publik/terindeks.

export type Stance = "pro" | "kontra" | "netral";
export type PostFlag =
  | "none"
  | "hoaks"
  | "ujaran_kebencian"
  | "provokasi"
  | "ancaman"
  | "kampanye_terorganisir"
  | "doxing";

// Jenis akun pengunggah — dipakai menyaring supaya sumbernya valid.
// resmi = akun asli milik target; terverifikasi = akun bercentang platform;
// media = akun resmi media/lembaga; publik = akun identitas jelas tapi tanpa centang;
// anonim = nama samaran/tanpa identitas; palsu = parodi/impersonasi/fanbase
// yang mengatasnamakan target.
export type AccountType =
  | "resmi"
  | "terverifikasi"
  | "media"
  | "publik"
  | "anonim"
  | "palsu";

// Akun yang dianggap sumber sahih (dipakai filter default di UI).
export const TRUSTED_ACCOUNTS: AccountType[] = ["resmi", "terverifikasi", "media"];

// Bentuk interaksi. Threads & X punya post asli, balasan (reply), repost, kutipan;
// Instagram punya post/reels + komentar.
export type PostType =
  | "post"
  | "reply"
  | "repost"
  | "quote"
  | "comment"
  | "reels"
  | "lainnya";

// Gerakan / aksi kolektif yang diserukan atau dibahas.
export type MovementType =
  | "none"
  | "demo"
  | "aksi_massa"
  | "seruan_massa"
  | "petisi"
  | "boikot"
  | "mogok"
  | "penggalangan"
  | "kampanye_politik";

export type SocialPost = {
  platform: string; // threads|instagram|x (hanya post sosmed asli)
  account: string; // nama/handle akun pengunggah
  accountUrl: string;
  url: string; // URL post asli
  published: string; // ISO 8601 bila ada
  content: string; // kutipan isi post
  summary: string; // ringkasan Bahasa Indonesia
  sentiment: "positive" | "negative" | "neutral";
  sentiment_score: number; // -1..1
  engagement: number; // 0-100 estimasi keramaian (like/komen/share/views)
  stance: Stance; // sikap pengunggah terhadap target
  flag: PostFlag; // anomali/konten berisiko
  accountType: AccountType; // jenis akun pengunggah
  verified: boolean; // centang resmi platform
  byTarget: boolean; // true = diunggah akun RESMI target (pernyataan langsung)
  postType: PostType; // post asli / reply / repost / komentar
  replyTo: string; // akun/handle yang dibalas (bila reply/quote/repost)
  movement: MovementType; // gerakan yang diserukan/dibahas di post ini
};

// Gerakan/aksi kolektif terkait target (mis. demo, aksi massa, petisi).
export type MovementItem = {
  jenis: MovementType;
  topic: string;
  summary: string;
  tanggal: string; // tanggal aksi (ISO/teks apa adanya)
  lokasi: string; // kota + titik kumpul yang diumumkan publik
  penggerak: string; // pihak/akun yang menyerukan
  peranTarget: string; // penggerak|pendukung|dikritik|disebut|tidak_terkait
  skala: string; // perkiraan skala (mis. "ratusan massa")
  status: string; // rencana|berlangsung|selesai|batal
  urls: string[];
};

// Akun yang mengatasnamakan target (parodi/impersonasi) — bukan sumber valid,
// tapi tetap dilaporkan supaya bisa ditindak.
export type ImpersonatorAccount = {
  platform: string;
  handle: string;
  url: string;
  reason: string;
};

export type AccountStatus = "aktif" | "nonaktif" | "tidak_diketahui";

export type TargetAccount = {
  platform: string;
  handle: string; // username, mis. @nama
  url: string; // URL profil
  verified: boolean;
  followers: string; // teks apa adanya, mis. "1,2 jt"
  status: AccountStatus; // aktif = masih posting dalam ~90 hari
  lastPost: string; // tanggal aktivitas terakhir yang terlihat
};

export type TargetProfile = {
  name: string;
  aka: string[]; // nama lain / panggilan / ejaan lain
  role: string; // jabatan/peran publik ORANG ini
  org: string; // instansi/organisasi/partai tempat dia bernaung
  domisili: string; // kota/daerah aktivitas publik (level kota, bukan alamat)
  bio: string; // profil publik singkat orangnya
  photo: string; // URL foto profil publik (dari akun resmi/situs resmi)
  photoSource: string; // dari mana foto itu diambil
  accounts: TargetAccount[]; // akun resmi milik orang ini
};

export type TargetIssue = {
  topic: string;
  summary: string;
  heat: number; // 0-100
  sentiment: "positive" | "negative" | "neutral";
};

export type TargetResult = {
  name: string;
  days: number;
  generatedAt: number;
  cached: boolean;
  profile: TargetProfile;
  issues: TargetIssue[];
  movements: MovementItem[];
  impersonators: ImpersonatorAccount[];
  posts: SocialPost[];
};

const CACHE_MS =
  (Number(process.env.TARGET_CACHE_MINUTES) || 60) * 60 * 1000;

// Aturan yang dipakai semua pass (profil & per-platform).
const RULES = `Kamu analis OSINT media sosial untuk pemantauan SOSOK PERORANGAN (individu) di Indonesia.
Target selalu SATU ORANG — tokoh publik/pejabat/influencer/figur dengan jejak publik.
BUKAN organisasi, BUKAN partai, BUKAN topik. Kalau namanya mirip nama lembaga, tetap ambil ORANG-nya.
Tugasmu: memetakan JEJAK & INTERAKSI orang itu serta percakapan publik tentang dia.

PLATFORM (TAHAP INI HANYA 3, jangan keluar dari ini):
1. THREADS  2. INSTAGRAM (post/reels publik)  3. X / TWITTER
Jangan ambil TikTok, Facebook, YouTube, Telegram, Reddit, forum.

DILARANG KERAS untuk bagian "posts": mengambil ARTIKEL PORTAL BERITA.
Isi "posts" WAJIB berupa POSTINGAN MEDIA SOSIAL ASLI dengan URL langsung ke post-nya
(threads.net/..., instagram.com/p/... atau /reel/..., x.com/.../status/...).
URL ke detik.com, kompas.com, tribunnews, cnnindonesia, blog, atau situs berita apa pun
= TOLAK, jangan dimasukkan. Banyak portal memuat klaim palsu/hoaks — sumbernya harus
postingan aslinya, bukan tulisan orang tentang postingan itu. Portal berita boleh dipakai
diam-diam untuk MENEMUKAN post aslinya, tapi yang dilaporkan tetap URL post media sosialnya.

VALIDITAS SUMBER — PALING PENTING:
- UTAMAKAN akun ASLI: akun RESMI milik orang itu sendiri (centang/diakui publik & media),
  akun TERVERIFIKASI, dan akun MEDIA resmi. Ini yang bikin datanya sahih.
- Tiap post isi "account_type": resmi | terverifikasi | media | publik | anonim | palsu
  ("resmi" HANYA untuk akun milik orang target sendiri) dan "verified" true/false (centang platform).
- Post akun PALSU/PARODI/impersonasi/fanbase yang mengaku target JANGAN dimasukkan ke "posts"
  sebagai pernyataan target. Taruh akunnya di "impersonators".
- "by_target": true HANYA bila diunggah akun RESMI target (pernyataan/interaksi langsung dia).
  Jangan pernah menandai post akun lain sebagai pernyataan target.
- Kalau kepemilikan akun ragu, pakai "publik"/"anonim" — jangan naikkan jadi "resmi".
- Minimal 60% isi "posts" dari akun resmi/terverifikasi/media bila tersedia.

INTERAKSI (WAJIB, khas Threads/X):
- Bedakan bentuk konten lewat "post_type": post | reply | repost | quote | comment | reels | lainnya.
- Threads & X: JANGAN cuma ambil post utama. Ambil juga BALASAN (reply) dan kutipan (quote) —
  baik balasan orang target ke akun lain, maupun balasan tokoh/akun kredibel ke postingan target.
- Bila reply/quote/repost, isi "reply_to" dengan akun/handle yang dibalas atau dikutip.
- Target minimal 5 item dengan post_type "reply"/"quote" bila tersedia — di situ letak interaksinya.

GERAKAN / MOBILISASI (fokus khusus):
- Deteksi postingan yang menyerukan atau membahas GERAKAN untuk Indonesia: demo/unjuk rasa,
  aksi massa, seruan turun ke jalan, petisi, boikot, mogok, penggalangan dana/solidaritas,
  kampanye politik. Isi "movement" per post: none | demo | aksi_massa | seruan_massa | petisi |
  boikot | mogok | penggalangan | kampanye_politik.
- Rangkum di bagian "movements": jenis, topik, ringkasan, tanggal aksi, lokasi (kota + titik kumpul
  yang DIUMUMKAN PUBLIK), penggerak, peran target (penggerak|pendukung|dikritik|disebut|tidak_terkait),
  perkiraan skala, status (rencana|berlangsung|selesai|batal), dan URL sumbernya.
- Laporkan apa adanya dari sumber terbuka. Jangan menebak rencana yang tidak diumumkan publik.

BATASAN WAJIB (jangan dilanggar):
- Hanya konten yang bisa dibuka publik. Jangan menebak isi akun privat/DM/grup tertutup.
- JANGAN memuat data pribadi sensitif: alamat rumah, NIK/KTP, nomor telepon, email pribadi,
  data keluarga/anak di bawah umur, data medis/keuangan pribadi. Kalau muncul di sumber, jangan disalin.
- Hanya sosok dengan peran publik. Bila nama yang diminta jelas orang privat (bukan figur publik),
  kembalikan posts kosong dan tulis di profile.bio: "bukan figur publik — tidak dipantau".
- Netral & faktual. Klaim belum terverifikasi tulis sebagai "klaim/dugaan (belum terverifikasi)".
- Jangan mengarang akun, URL, angka, atau kutipan. Tidak ketemu -> kosongkan / list kosong.
- Setiap post WAJIB punya URL asli yang bisa dibuka.`;

// ---------- Pass 1: profil, akun, impersonator, isu, gerakan ----------
const SYSTEM_PROFILE = `${RULES}

KELUARAN 4 bagian (JANGAN keluarkan "posts" di pass ini):

1) "profile" — identitas publik ORANG-nya: "name" (ejaan resmi), "aka" (panggilan/ejaan lain
   yang dipakai warganet), "role" (peran/jabatan publik saat ini), "org", "domisili" (kota saja,
   JANGAN alamat), "bio" (2-3 kalimat: siapa dia, kiprahnya, kenapa jadi sorotan).
   - "photo": URL FOTO PROFIL/potret resmi orang ini yang publik & bisa dibuka langsung
     (file gambar .jpg/.jpeg/.png/.webp). Sumber yang boleh: foto profil akun RESMI-nya,
     situs resmi instansi/partainya, atau Wikimedia Commons. JANGAN pakai foto dari akun
     palsu/parodi, JANGAN halaman HTML (harus URL gambarnya langsung), JANGAN mengarang URL.
     Kalau tidak yakin fotonya benar orang ini, kosongkan.
   - "photo_source": asal foto (mis. "akun Instagram resmi @x" / "Wikimedia Commons").
   - "accounts" = akun RESMI miliknya di threads/instagram/x. Tiap akun isi:
     "platform", "handle" (username), "url" (URL profil), "verified" (centang platform),
     "followers" (jumlah pengikut apa adanya, mis. "1,2 jt" — kosongkan bila tak terlihat),
     "status": aktif (masih memposting dalam ~90 hari terakhir) | nonaktif (lama vakum/ditutup)
     | tidak_diketahui, dan "last_post" (tanggal aktivitas terakhir yang terlihat).

2) "impersonators" — akun yang MENGATASNAMAKAN dia (parodi/impersonasi/fanbase yang mengaku dia):
   platform, handle, url, "reason". Kosongkan bila tidak ada.

3) "issues" — 3-6 isu/percakapan utama yang menyeret namanya dalam rentang waktu diminta:
   "topic", "summary" (1-2 kalimat), "heat" 0-100, "sentiment".

4) "movements" — 0-6 gerakan/aksi kolektif terkait dia (lihat aturan GERAKAN di atas).

EFISIENSI: batasi pencarian web seperlunya (maksimal ~6 kali).

Keluarkan HANYA JSON valid, tanpa penjelasan, tanpa code fence, bentuk:
{
  "profile": { "name":"", "aka":[""], "role":"", "org":"", "domisili":"", "bio":"",
    "photo":"", "photo_source":"",
    "accounts":[{"platform":"instagram","handle":"@x","url":"","verified":false,
      "followers":"","status":"aktif","last_post":""}] },
  "impersonators": [{ "platform":"x", "handle":"@x_parody", "url":"", "reason":"" }],
  "issues": [{ "topic":"", "summary":"", "heat":0, "sentiment":"neutral" }],
  "movements": [{ "jenis":"demo", "topic":"", "summary":"", "tanggal":"", "lokasi":"",
    "penggerak":"", "peran_target":"disebut", "skala":"", "status":"rencana", "urls":[""] }]
}`;

// ---------- Pass 2-4: postingan, SATU platform per pass ----------
// Dipisah supaya Instagram & Threads tidak kalah jatah pencarian oleh X
// (post X jauh lebih banyak terindeks mesin pencari).
const PLATFORM_HINT: Record<string, string> = {
  threads:
    `THREADS (threads.com / threads.net). Bentuk URL post: https://www.threads.com/@user/post/XXXX ` +
    `(domain lama threads.net juga sah). Cara mencari: pakai operator site:threads.com dan ` +
    `site:threads.net digabung nama target & kata kunci isunya, juga cari lewat handle akun resminya. ` +
    `Threads penuh balasan — ambil reply, bukan cuma post utama.`,
  instagram:
    `INSTAGRAM. Bentuk URL post: https://www.instagram.com/p/XXXX/ atau /reel/XXXX/ ` +
    `(URL profil saja TIDAK dihitung sebagai post). Cara mencari: operator site:instagram.com ` +
    `dengan nama target/handle-nya, plus caption khas isunya. Sertakan reels bila relevan.`,
  x:
    `X / TWITTER. Bentuk URL post: https://x.com/user/status/XXXX (twitter.com juga sah). ` +
    `Cara mencari: operator site:x.com / site:twitter.com dengan nama target & isunya. ` +
    `Ambil campuran post asli, reply, dan quote.`,
};

const systemPosts = (platform: string) => `${RULES}

PASS INI KHUSUS SATU PLATFORM: ${platform.toUpperCase()}.
${PLATFORM_HINT[platform] || ""}

Cari SEKUAT MUNGKIN di platform ini saja. JANGAN mengembalikan post dari platform lain —
kalau di platform ini benar-benar tidak ada, kembalikan "posts": [] (jangan diganti platform lain,
jangan mengarang URL). Usahakan 6-12 item bila memang tersedia.

Keluarkan HANYA "posts": 6-12 POSTINGAN ${platform.toUpperCase()} paling relevan & terbaru
(campur post asli, reply, quote). BUKAN artikel berita — lihat larangan di atas.
   - "platform": "${platform}". "account", "account_url",
     "url" (URL post asli di ${platform}), "published" (ISO 8601).
   - "account_type", "verified", "by_target", "post_type", "reply_to" (lihat aturan di atas).
   - "content" kutipan singkat isi post (maks ~300 karakter, apa adanya).
   - "summary" ringkasan Bahasa Indonesia 1 kalimat.
   - "sentiment" positive|negative|neutral + "sentiment_score" -1..1 (nada TERHADAP orang ini).
   - "engagement" 0-100 (estimasi keramaian like/komentar/share; 0 bila tak diketahui).
   - "stance": pro | kontra | netral. "movement": jenis gerakan di post ini (none bila tak ada).
   - "flag": none | hoaks | ujaran_kebencian | provokasi | ancaman | kampanye_terorganisir | doxing.
     Selain "none" HANYA bila terindikasi kuat. Urut dari terbaru.

EFISIENSI: maksimal ~6 kali pencarian web.

Keluarkan HANYA JSON valid, tanpa penjelasan, tanpa code fence, bentuk:
{
  "posts": [{ "platform":"${platform}", "account":"", "account_url":"", "url":"", "published":"",
    "account_type":"terverifikasi", "verified":true, "by_target":false,
    "post_type":"reply", "reply_to":"", "movement":"none",
    "content":"", "summary":"", "sentiment":"neutral", "sentiment_score":0,
    "engagement":0, "stance":"netral", "flag":"none" }]
}`;

// Platform yang disisir MODEL lewat web search.
export const MODEL_PLATFORMS = ["threads", "instagram", "x"];

// Facebook tidak ikut pass model (hasil pencarian publiknya nyaris tidak
// terindeks). Datanya datang dari worker Chromium — lihat worker/fb-worker.mjs
// dan /api/fb/ingest.
export const PLATFORMS = [...MODEL_PLATFORMS, "facebook"];

// Host resmi tiap platform — dipakai memastikan URL post benar-benar sosmed,
// bukan tulisan portal berita tentang postingan itu.
const HOST_OK: Record<string, RegExp> = {
  threads: /(^|\.)threads\.(net|com)$/i,
  instagram: /(^|\.)instagram\.com$/i,
  x: /(^|\.)(x|twitter)\.com$/i,
  facebook: /(^|\.)(facebook|fb)\.com$/i,
};

function socialHost(url: string, platform: string): boolean {
  try {
    const host = new URL(url).hostname;
    const re = HOST_OK[platform];
    return re ? re.test(host) : false;
  } catch {
    return false;
  }
}

const ACCOUNT_TYPES: AccountType[] = [
  "resmi",
  "terverifikasi",
  "media",
  "publik",
  "anonim",
  "palsu",
];
const POST_TYPES: PostType[] = [
  "post",
  "reply",
  "repost",
  "quote",
  "comment",
  "reels",
  "lainnya",
];
const MOVEMENTS: MovementType[] = [
  "none",
  "demo",
  "aksi_massa",
  "seruan_massa",
  "petisi",
  "boikot",
  "mogok",
  "penggalangan",
  "kampanye_politik",
];
const FLAGS: PostFlag[] = [
  "none",
  "hoaks",
  "ujaran_kebencian",
  "provokasi",
  "ancaman",
  "kampanye_terorganisir",
  "doxing",
];

const sentOf = (s: any): "positive" | "negative" | "neutral" =>
  ["positive", "negative", "neutral"].includes(s) ? s : "neutral";
const num0100 = (n: any) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
const score = (n: any) => Math.max(-1, Math.min(1, Number(n) || 0));
const platformOf = (p: any) => {
  const v = String(p || "").toLowerCase();
  if (v === "twitter" || v === "x.com") return "x";
  if (v === "ig") return "instagram";
  return PLATFORMS.includes(v) ? v : "";
};

// Tebak platform dari URL bila model salah/lupa isi field platform.
function platformFromUrl(url: string): string {
  for (const p of PLATFORMS) if (socialHost(url, p)) return p;
  return "";
}

const statusOf = (s: any): AccountStatus =>
  ["aktif", "nonaktif", "tidak_diketahui"].includes(s) ? s : "tidak_diketahui";

// Terima URL http(s) apa pun; yang memastikan itu benar-benar gambar adalah
// proxy /api/photo (cek content-type). Halaman HTML yang jelas bukan gambar
// disaring di sini supaya tidak buang-buang request.
function photoOf(u: any): string {
  const url = String(u || "").trim();
  if (!/^https?:\/\//i.test(url)) return "";
  if (/\.(html?|php|aspx)(\?|$)/i.test(url)) return "";
  return url;
}

// Cadangan foto: REST Wikipedia (tanpa API key). Dipakai kalau model tidak
// memberi foto atau fotonya ditolak — tokoh publik biasanya punya artikel.
async function wikiPhoto(
  name: string
): Promise<{ photo: string; source: string }> {
  const langs = ["id", "en"];
  for (const lang of langs) {
    try {
      const res = await fetch(
        `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
          name
        )}`,
        { headers: { "User-Agent": "mbahna-osint/1.0" } }
      );
      if (!res.ok) continue;
      const json: any = await res.json();
      const img = json?.originalimage?.source || json?.thumbnail?.source || "";
      if (img) {
        return { photo: String(img), source: `Wikipedia (${lang})` };
      }
    } catch {
      /* lanjut ke bahasa berikutnya */
    }
  }
  return { photo: "", source: "" };
}
const stanceOf = (s: any): Stance =>
  ["pro", "kontra", "netral"].includes(s) ? s : "netral";
const flagOf = (f: any): PostFlag => (FLAGS.includes(f) ? f : "none");
const acctOf = (a: any): AccountType =>
  ACCOUNT_TYPES.includes(a) ? a : "publik";
const postTypeOf = (p: any): PostType => (POST_TYPES.includes(p) ? p : "post");
const moveOf = (m: any): MovementType => (MOVEMENTS.includes(m) ? m : "none");

function parse(
  text: string,
  name: string
): Omit<TargetResult, "name" | "days" | "generatedAt" | "cached"> {
  const parsed = extractJson(text) || {};
  const p = parsed.profile || {};

  const profile: TargetProfile = {
    name: String(p.name || name),
    aka: (Array.isArray(p.aka) ? p.aka : [])
      .map((a: any) => String(a || "").trim())
      .filter(Boolean),
    role: String(p.role || ""),
    org: String(p.org || ""),
    domisili: String(p.domisili || ""),
    bio: String(p.bio || ""),
    photo: photoOf(p.photo),
    photoSource: String(p.photo_source || p.photoSource || ""),
    accounts: (Array.isArray(p.accounts) ? p.accounts : [])
      .filter((a: any) => a && (a.handle || a.url))
      .map((a: any) => {
        const url = String(a.url || "");
        return {
          platform: platformOf(a.platform) || platformFromUrl(url),
          handle: String(a.handle || ""),
          url,
          verified: !!a.verified,
          followers: String(a.followers || ""),
          status: statusOf(a.status),
          lastPost: String(a.last_post || a.lastPost || ""),
        };
      })
      .filter((a: TargetAccount) => a.platform),
  };

  const impersonators: ImpersonatorAccount[] = (
    Array.isArray(parsed.impersonators) ? parsed.impersonators : []
  )
    .filter((a: any) => a && (a.handle || a.url))
    .map((a: any) => {
      const url = String(a.url || "");
      return {
        platform: platformOf(a.platform) || platformFromUrl(url) || "sosmed",
        handle: String(a.handle || ""),
        url,
        reason: String(a.reason || ""),
      };
    });

  const issues: TargetIssue[] = (Array.isArray(parsed.issues) ? parsed.issues : [])
    .filter((i: any) => i && i.topic)
    .map((i: any) => ({
      topic: String(i.topic || ""),
      summary: String(i.summary || ""),
      heat: num0100(i.heat),
      sentiment: sentOf(i.sentiment),
    }))
    .sort((a: TargetIssue, b: TargetIssue) => b.heat - a.heat);

  const movements: MovementItem[] = (
    Array.isArray(parsed.movements) ? parsed.movements : []
  )
    .filter((m: any) => m && (m.topic || m.jenis))
    .map((m: any) => ({
      jenis: moveOf(m.jenis),
      topic: String(m.topic || ""),
      summary: String(m.summary || ""),
      tanggal: String(m.tanggal || ""),
      lokasi: String(m.lokasi || ""),
      penggerak: String(m.penggerak || ""),
      peranTarget: String(m.peran_target || m.peranTarget || ""),
      skala: String(m.skala || ""),
      status: String(m.status || ""),
      urls: (Array.isArray(m.urls) ? m.urls : [])
        .map((u: any) => String(u || ""))
        .filter(Boolean),
    }));

  const posts: SocialPost[] = (Array.isArray(parsed.posts) ? parsed.posts : [])
    .filter((s: any) => s && s.url)
    .map((s: any): SocialPost => {
      const accountType = acctOf(s.account_type || s.accountType);
      const url = String(s.url || "");
      return {
        platform: platformOf(s.platform) || platformFromUrl(url),
        account: String(s.account || ""),
        accountUrl: String(s.account_url || s.accountUrl || ""),
        url,
        published: String(s.published || ""),
        content: String(s.content || "").slice(0, 400),
        summary: String(s.summary || ""),
        sentiment: sentOf(s.sentiment),
        sentiment_score: score(s.sentiment_score),
        engagement: num0100(s.engagement),
        stance: stanceOf(s.stance),
        flag: flagOf(s.flag),
        accountType,
        verified: !!s.verified || accountType === "resmi",
        // Pernyataan langsung hanya sah dari akun resmi target.
        byTarget: !!(s.by_target || s.byTarget) && accountType === "resmi",
        postType: postTypeOf(s.post_type || s.postType),
        replyTo: String(s.reply_to || s.replyTo || ""),
        movement: moveOf(s.movement),
      };
    })
    // Akun palsu tidak boleh nyasar ke daftar post (sumber tidak sahih), dan
    // URL wajib post sosmed asli — artikel portal berita dibuang di sini.
    .filter(
      (s: SocialPost) =>
        s.accountType !== "palsu" &&
        PLATFORMS.includes(s.platform) &&
        socialHost(s.url, s.platform)
    );

  return { profile, issues, movements, impersonators, posts: rank(posts) };
}

function urlKey(u: string): string {
  return u.replace(/^https?:\/\//, "").replace(/\/+$/, "").toLowerCase();
}

// ---------- Facebook: hasil worker Chromium ----------
// Post FB tidak lewat model, jadi analisanya seperlunya & jujur: sentimen
// dibiarkan netral (bukan hasil analisa), gerakan dideteksi dari kata kunci.
const MOVE_WORDS: [RegExp, MovementType][] = [
  [/\b(demo|unjuk rasa|turun ke jalan|long march)\b/i, "demo"],
  [/\b(aksi massa|aksi damai|aksi solidaritas)\b/i, "aksi_massa"],
  [/\b(ajak|seruan|serukan|mari|ayo)\b.{0,40}\b(aksi|demo|kumpul)\b/i, "seruan_massa"],
  [/\b(petisi|change\.org)\b/i, "petisi"],
  [/\b(boikot)\b/i, "boikot"],
  [/\b(mogok)\b/i, "mogok"],
  [/\b(galang dana|penggalangan|donasi|patungan)\b/i, "penggalangan"],
  [/\b(kampanye|kampanyekan|coblos|menang(kan)?)\b/i, "kampanye_politik"],
];

export function detectMovement(text: string): MovementType {
  for (const [re, kind] of MOVE_WORDS) if (re.test(text)) return kind;
  return "none";
}

// "1,2 rb reaksi - 340 komentar" -> angka terbesar, dipetakan ke skala 0-100.
export function engagementFrom(text: string): number {
  const nums = (text.match(/[\d.,]+\s*(rb|jt|k|m)?/gi) || []).map((raw) => {
    const m = raw.trim().toLowerCase();
    const n = Number(m.replace(/[^\d,.]/g, "").replace(/\./g, "").replace(",", "."));
    if (Number.isNaN(n)) return 0;
    if (/rb|k/.test(m)) return n * 1000;
    if (/jt|m/.test(m)) return n * 1000000;
    return n;
  });
  const top = Math.max(0, ...nums);
  if (!top) return 0;
  // skala logaritmik: 10 -> ~25, 1.000 -> ~50, 100.000 -> ~75
  return Math.max(1, Math.min(100, Math.round((Math.log10(top) / 6) * 100)));
}

export function fbToPost(p: FbRawPost): SocialPost {
  const text = `${p.content} ${p.account}`;
  return {
    platform: "facebook",
    account: p.account,
    accountUrl: p.accountUrl,
    url: p.url,
    published: p.published,
    content: p.content,
    // Tidak diringkas model; tandai asalnya supaya tidak dikira analisa.
    summary: "Diambil worker Facebook (Page/grup publik) — belum diringkas model.",
    sentiment: "neutral",
    sentiment_score: 0,
    engagement: engagementFrom(p.engagementText),
    stance: "netral",
    flag: "none",
    accountType: "publik",
    verified: false,
    byTarget: false,
    postType: "post",
    replyTo: "",
    movement: detectMovement(text),
  };
}

// Urutan tampil: pernyataan langsung target > akun tepercaya > ber-flag/gerakan
// > engagement tertinggi. Duplikat URL dibuang.
function rank(list: SocialPost[]): SocialPost[] {
  const seen = new Set<string>();
  const out: SocialPost[] = [];
  for (const s of list) {
    if (!s.url) continue;
    const k = urlKey(s.url);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  const w = (s: SocialPost) =>
    (s.byTarget ? 400 : 0) +
    (TRUSTED_ACCOUNTS.includes(s.accountType) ? 200 : 0) +
    (s.flag !== "none" ? 100 : 0) +
    (s.movement !== "none" ? 60 : 0) +
    s.engagement;
  return out.sort((a, b) => w(b) - w(a));
}

export async function crawlTarget(
  name: string,
  opts: { fresh?: boolean; days?: number } = {}
): Promise<TargetResult> {
  const n = name.trim();
  const days = Math.max(1, Math.min(90, opts.days || 14));
  if (!n) {
    return {
      name: n,
      days,
      generatedAt: Date.now(),
      cached: false,
      profile: {
        name: n,
        aka: [],
        role: "",
        org: "",
        domisili: "",
        bio: "",
        photo: "",
        photoSource: "",
        accounts: [],
      },
      issues: [],
      movements: [],
      impersonators: [],
      posts: [],
    };
  }

  // Facebook: hasil worker Chromium yang masuk lewat /api/fb/ingest. Dibaca di
  // luar cache model supaya kiriman worker terbaru langsung kelihatan.
  const fb = (await getFbPosts(n)).map(fbToPost);

  const key = `target:${normName(n)}:${days}`;
  if (!opts.fresh) {
    const cached = await getCache<TargetResult>(key, CACHE_MS);
    if (cached && cached.data.posts.length > 0) {
      return {
        ...cached.data,
        cached: true,
        posts: rank([...cached.data.posts, ...fb]),
      };
    }
  }

  const now = new Date();
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const periode =
    `NAMA TARGET (individu/perorangan): "${n}".\n` +
    `Hari ini: ${iso(now)}. Rentang pantau: ${iso(since)} s/d ${iso(now)} (${days} hari terakhir).\n`;

  const profilePrompt =
    periode +
    `Petakan profil publik ORANG ini: identitas, foto profil resmi ("photo"), akun resmi di ` +
    `Threads/Instagram/X lengkap dengan status aktif-nonaktif, jumlah followers, dan tanggal ` +
    `aktivitas terakhir. Daftar juga akun palsu/parodi yang mengatasnamakan dia di "impersonators", ` +
    `isu yang menyeret namanya, serta gerakan (demo/aksi massa/petisi/boikot/penggalangan) yang ` +
    `terkait dia. JANGAN keluarkan "posts" di pass ini. ` +
    `PENTING: pastikan JSON valid dan LENGKAP sampai kurung tutup terakhir, jangan terpotong.`;

  const postPrompt = (p: string) =>
    periode +
    `Sisir HANYA ${p.toUpperCase()}. Ambil post asli DAN balasan (reply) serta kutipan (quote) — ` +
    `termasuk interaksi orang ini dengan akun lain. Utamakan akun RESMI miliknya dan akun ` +
    `terverifikasi/media. URL wajib permalink post di ${p} — JANGAN artikel portal berita, ` +
    `JANGAN platform lain. Tidak ada hasil di ${p} -> kembalikan "posts": []. ` +
    `PENTING: pastikan JSON valid dan LENGKAP sampai kurung tutup terakhir, jangan terpotong.`;

  // Empat pass paralel: 1 profil + 1 per platform. Tanpa pemisahan ini, satu
  // pass gabungan cenderung habis di X karena post X paling banyak terindeks.
  const [profileRes, ...platformRes] = await Promise.allSettled([
    runWeb(SYSTEM_PROFILE, profilePrompt, 6000, "target"),
    ...MODEL_PLATFORMS.map((p) => runWeb(systemPosts(p), postPrompt(p), 6000, "target")),
  ]);

  const base = parse(
    profileRes.status === "fulfilled" ? profileRes.value : "",
    n
  );
  const perPlatform = platformRes.map((r, i) =>
    parse(r.status === "fulfilled" ? r.value : "", n).posts.filter(
      (s) => s.platform === MODEL_PLATFORMS[i]
    )
  );

  // Foto kosong -> coba Wikipedia sebelum menyerah ke avatar inisial.
  let profile = base.profile;
  if (!profile.photo) {
    const w = await wikiPhoto(profile.name || n);
    if (w.photo) profile = { ...profile, photo: w.photo, photoSource: w.source };
  }

  const result: TargetResult = {
    name: n,
    days,
    generatedAt: Date.now(),
    cached: false,
    ...base,
    profile,
    posts: rank([...base.posts, ...perPlatform.flat()]),
  };
  // Yang di-cache hanya hasil model; post Facebook digabung saat dibaca supaya
  // kiriman worker berikutnya tidak tertahan cache.
  if (result.posts.length > 0) await setCache<TargetResult>(key, n, result);
  return { ...result, posts: rank([...result.posts, ...fb]) };
}
