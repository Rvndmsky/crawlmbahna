import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { normName } from "./targets";

// Penyimpanan hasil kiriman worker Facebook (worker/fb-worker.mjs).
//
// DUA MODE:
// 1. Upstash Redis (aktif bila UPSTASH_REDIS_REST_URL + TOKEN di-set) — WAJIB
//    untuk Vercel, karena filesystem serverless read-only dan /tmp bersifat
//    ephemeral + per-instance (data hilang atau tak terbaca instance lain).
// 2. Berkas data/fb-posts.json — dipakai saat aplikasi jalan lokal.

export type FbComment = {
  author: string;
  text: string;
  likes: number; // jumlah like/reaksi komentar
  url: string;
};

export type FbRawPost = {
  url: string;
  account: string;
  accountUrl: string;
  published: string; // teks apa adanya dari Facebook ("3 j", "12 Agustus")
  publishedAt: number; // hasil pembacaan waktu -> unix ms (0 = tak terbaca)
  title: string; // diturunkan dari kalimat pertama (Facebook tak punya judul)
  content: string;
  engagementText: string;
  comments: FbComment[]; // komentar teratas, urut like terbanyak
  shotId: string; // id tangkapan layar (gambarnya disimpan terpisah)
};

export type FbEntry = {
  query: string;
  collectedAt: number;
  posts: FbRawPost[];
};

const DATA_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), "mbahna-data")
  : path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "fb-posts.json");

const MAX_ENTRIES = 400; // batas supaya penyimpanan tidak membengkak
const MAX_POSTS_PER_QUERY = 200;

// ---------- Upstash Redis (REST, tanpa dependency tambahan) ----------
const REDIS_URL = (process.env.UPSTASH_REDIS_REST_URL || "").replace(/\/+$/, "");
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";
export const usingRedis = !!(REDIS_URL && REDIS_TOKEN);

const KEY_SET = "fb:queries"; // set berisi daftar kunci kueri
const keyOf = (query: string) => `fb:entry:${normName(query)}`;

async function redis(cmd: (string | number)[]): Promise<any> {
  const res = await fetch(REDIS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(cmd),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`upstash ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const json: any = await res.json();
  if (json?.error) throw new Error(`upstash: ${json.error}`);
  return json?.result;
}

// ---------- berkas JSON (mode lokal) ----------
function loadFile(): FbEntry[] {
  try {
    if (!fs.existsSync(FILE)) return [];
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveFile(list: FbEntry[]) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(
      FILE,
      JSON.stringify(list.slice(-MAX_ENTRIES), null, 2),
      "utf8"
    );
  } catch {
    /* read-only FS: lewati — untuk produksi pakai Redis */
  }
}

function urlKey(u: string): string {
  return u.replace(/^https?:\/\//, "").replace(/\/+$/, "").toLowerCase();
}

// Gabung entri lama + baru, dedup per URL, batasi jumlahnya.
function mergeEntry(
  prev: FbEntry | null,
  next: FbEntry
): { entry: FbEntry; fresh: number } {
  if (!prev) {
    return {
      entry: { ...next, posts: next.posts.slice(0, MAX_POSTS_PER_QUERY) },
      fresh: next.posts.length,
    };
  }
  const seen = new Set(prev.posts.map((p) => urlKey(p.url)));
  const fresh = next.posts.filter((p) => !seen.has(urlKey(p.url)));
  return {
    entry: {
      query: next.query,
      collectedAt: next.collectedAt,
      posts: [...fresh, ...prev.posts].slice(0, MAX_POSTS_PER_QUERY),
    },
    fresh: fresh.length,
  };
}

const parseEntry = (raw: any): FbEntry | null => {
  if (!raw) return null;
  try {
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
};

// ---------- tangkapan layar ----------
// Gambar disimpan TERPISAH dari entri: kalau ikut di dalam entri, satu SET ke
// Upstash bisa menembus batas ukuran permintaan.
const SHOT_DIR = path.join(DATA_DIR, "shots");
const shotKey = (id: string) => `fb:shot:${id}`;

// Id dari URL post — cukup dengan hash sederhana, bukan untuk keamanan.
export function shotIdFor(url: string): string {
  let h = 0;
  for (let i = 0; i < url.length; i++) {
    h = (h * 31 + url.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36) + "-" + url.length.toString(36);
}

export async function saveShot(id: string, base64: string): Promise<void> {
  if (!id || !base64) return;
  if (usingRedis) {
    // Simpan 30 hari; bukti visual tidak perlu abadi.
    await redis(["SET", shotKey(id), base64, "EX", 60 * 60 * 24 * 30]);
    return;
  }
  try {
    if (!fs.existsSync(SHOT_DIR)) fs.mkdirSync(SHOT_DIR, { recursive: true });
    fs.writeFileSync(path.join(SHOT_DIR, `${id}.b64`), base64, "utf8");
  } catch {
    /* read-only FS: lewati */
  }
}

export async function getShot(id: string): Promise<string> {
  if (!id) return "";
  if (usingRedis) {
    const v = await redis(["GET", shotKey(id)]);
    return typeof v === "string" ? v : "";
  }
  try {
    const f = path.join(SHOT_DIR, `${id}.b64`);
    return fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "";
  } catch {
    return "";
  }
}

// ---------- API modul ----------
export async function saveFbEntry(entry: FbEntry): Promise<number> {
  if (usingRedis) {
    const key = keyOf(entry.query);
    const prev = parseEntry(await redis(["GET", key]));
    const { entry: merged, fresh } = mergeEntry(prev, entry);
    await redis(["SET", key, JSON.stringify(merged)]);
    await redis(["SADD", KEY_SET, key]);
    return fresh;
  }

  const list = loadFile();
  const idx = list.findIndex((e) => normName(e.query) === normName(entry.query));
  const { entry: merged, fresh } = mergeEntry(idx === -1 ? null : list[idx], entry);
  if (idx === -1) list.push(merged);
  else list[idx] = merged;
  saveFile(list);
  return fresh;
}

// Semua entri, kiriman terbaru di depan. Dipakai halaman /facebook.
export async function listFbEntries(): Promise<FbEntry[]> {
  let list: FbEntry[];

  if (usingRedis) {
    const keys: string[] = (await redis(["SMEMBERS", KEY_SET])) || [];
    if (!keys.length) return [];
    const raws: any[] = (await redis(["MGET", ...keys])) || [];
    list = raws
      .map(parseEntry)
      .filter((e): e is FbEntry => !!e && Array.isArray(e.posts));
  } else {
    list = loadFile();
  }

  return list.sort((a, b) => (b.collectedAt || 0) - (a.collectedAt || 0));
}

// Post untuk satu nama target: kueri yang mengandung namanya, atau postingan
// yang menyebut namanya di judul/isi.
export async function getFbPosts(name: string): Promise<FbRawPost[]> {
  const key = normName(name);
  if (!key) return [];
  const out: FbRawPost[] = [];
  const seen = new Set<string>();

  for (const entry of await listFbEntries()) {
    const queryMatch = normName(entry.query).includes(key);
    for (const p of entry.posts) {
      const textMatch = normName(`${p.title || ""} ${p.content || ""}`).includes(key);
      if (!queryMatch && !textMatch) continue;
      const k = urlKey(p.url);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(p);
    }
  }
  return out;
}

// Ringkasan untuk halaman Setup: berapa kueri, berapa post, kapan terakhir,
// dan penyimpanan mana yang sedang dipakai.
export async function fbStats(): Promise<{
  queries: number;
  posts: number;
  lastCollectedAt: number;
  storage: "redis" | "file";
}> {
  const list = await listFbEntries();
  return {
    queries: list.length,
    posts: list.reduce((s, e) => s + e.posts.length, 0),
    lastCollectedAt: list.reduce((m, e) => Math.max(m, e.collectedAt || 0), 0),
    storage: usingRedis ? "redis" : "file",
  };
}
