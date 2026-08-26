import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { normName } from "./targets";

// Penyimpanan hasil kiriman worker Facebook (worker/fb-worker.mjs).
// Worker jalan di PC/VPS lalu POST ke /api/fb/ingest; hasilnya ditulis ke
// data/fb-posts.json. Di Vercel filesystem read-only -> /tmp (ephemeral,
// per-instance), jadi untuk produksi jangka panjang perlu KV/database.

export type FbRawPost = {
  url: string;
  account: string;
  accountUrl: string;
  published: string; // teks apa adanya dari Facebook ("3 j", "12 Agustus")
  content: string;
  engagementText: string;
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

const MAX_ENTRIES = 400; // batas supaya berkas tidak membengkak

function load(): FbEntry[] {
  try {
    if (!fs.existsSync(FILE)) return [];
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function save(list: FbEntry[]) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(list.slice(-MAX_ENTRIES), null, 2), "utf8");
  } catch {
    /* read-only FS (serverless): lewati */
  }
}

function urlKey(u: string): string {
  return u.replace(/^https?:\/\//, "").replace(/\/+$/, "").toLowerCase();
}

// Simpan satu kiriman worker. Entri dengan kueri sama digabung (dedup URL).
export function saveFbEntry(entry: FbEntry): number {
  const list = load();
  const key = normName(entry.query);
  const idx = list.findIndex((e) => normName(e.query) === key);

  if (idx === -1) {
    list.push(entry);
    save(list);
    return entry.posts.length;
  }

  const seen = new Set(list[idx].posts.map((p) => urlKey(p.url)));
  const fresh = entry.posts.filter((p) => !seen.has(urlKey(p.url)));
  list[idx] = {
    query: entry.query,
    collectedAt: entry.collectedAt,
    // yang terbaru di depan, batasi 200 per kueri
    posts: [...fresh, ...list[idx].posts].slice(0, 200),
  };
  save(list);
  return fresh.length;
}

// Ambil post untuk satu nama target: kueri yang mengandung namanya, atau
// postingan yang menyebut namanya di isi teks.
export function getFbPosts(name: string): FbRawPost[] {
  const key = normName(name);
  if (!key) return [];
  const out: FbRawPost[] = [];
  const seen = new Set<string>();

  for (const entry of load()) {
    const queryMatch = normName(entry.query).includes(key);
    for (const p of entry.posts) {
      const textMatch = normName(p.content || "").includes(key);
      if (!queryMatch && !textMatch) continue;
      const k = urlKey(p.url);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(p);
    }
  }
  return out;
}

// Ringkasan untuk halaman Setup: berapa kueri, berapa post, kapan terakhir.
export function fbStats(): {
  queries: number;
  posts: number;
  lastCollectedAt: number;
} {
  const list = load();
  return {
    queries: list.length,
    posts: list.reduce((s, e) => s + e.posts.length, 0),
    lastCollectedAt: list.reduce((m, e) => Math.max(m, e.collectedAt || 0), 0),
  };
}
