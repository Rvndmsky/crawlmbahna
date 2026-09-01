import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Cache hasil pemanggilan model (dashboard, pencarian, target, dossier).
//
// DUA MODE, sama seperti penyimpanan lain:
// 1. Upstash Redis bila ENV-nya ada — WAJIB di Vercel. Tanpa ini cache ditulis
//    ke /tmp yang ephemeral DAN per-instance: tiap permintaan bisa mendarat di
//    instance lain, cache selalu meleset, dan model dipanggil ulang terus.
//    Itu mahal dan lambat, bukan sekadar tidak rapi.
// 2. Berkas data/cache.json saat aplikasi jalan lokal.

const DATA_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), "mbahna-data")
  : path.join(process.cwd(), "data");
const CACHE_FILE = path.join(DATA_DIR, "cache.json");

export type CacheEntry<T> = {
  query: string;
  createdAt: number; // unix ms
  data: T;
};

type Store = Record<string, CacheEntry<any>>;

const REDIS_URL = (process.env.UPSTASH_REDIS_REST_URL || "").replace(/\/+$/, "");
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";
export const cacheDiRedis = !!(REDIS_URL && REDIS_TOKEN);

const kunci = (k: string) => `cache:${k}`;

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

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function load(): Store {
  try {
    ensureDir();
    if (!fs.existsSync(CACHE_FILE)) return {};
    return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")) as Store;
  } catch {
    return {};
  }
}

function save(store: Store) {
  try {
    ensureDir();
    fs.writeFileSync(CACHE_FILE, JSON.stringify(store, null, 2), "utf8");
  } catch {
    /* read-only FS (serverless): lewati */
  }
}

export async function getCache<T>(
  key: string,
  maxAgeMs: number
): Promise<CacheEntry<T> | null> {
  let entry: CacheEntry<T> | undefined;

  if (cacheDiRedis) {
    try {
      const raw = await redis(["GET", kunci(key)]);
      entry = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : undefined;
    } catch {
      return null; // Redis bermasalah -> anggap belum ada cache, jangan gagal
    }
  } else {
    entry = load()[key];
  }

  if (!entry) return null;
  if (Date.now() - entry.createdAt > maxAgeMs) return null;
  return entry;
}

export async function setCache<T>(
  key: string,
  query: string,
  data: T
): Promise<number> {
  const createdAt = Date.now();
  const entry: CacheEntry<T> = { query, createdAt, data };

  if (cacheDiRedis) {
    try {
      // Umur simpan 24 jam; kesegaran sebenarnya tetap diputuskan maxAgeMs
      // milik pemanggil saat membaca.
      await redis(["SET", kunci(key), JSON.stringify(entry), "EX", 86400]);
    } catch {
      /* gagal menyimpan cache tidak boleh menggagalkan permintaan */
    }
    return createdAt;
  }

  const store = load();
  store[key] = entry;
  save(store);
  return createdAt;
}
