import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Cache hasil pencarian berbasis file JSON (tanpa dependency native).
// Di serverless (Vercel) filesystem project read-only -> pakai /tmp (ephemeral,
// per-instance). Lokal -> ./data. Semua tulis best-effort (tidak crash bila gagal).

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
    /* read-only FS (serverless): lewati, cache jadi non-persist */
  }
}

export function getCache<T>(key: string, maxAgeMs: number): CacheEntry<T> | null {
  const store = load();
  const entry = store[key];
  if (!entry) return null;
  if (Date.now() - entry.createdAt > maxAgeMs) return null;
  return entry as CacheEntry<T>;
}

export function setCache<T>(key: string, query: string, data: T): number {
  const store = load();
  const createdAt = Date.now();
  store[key] = { query, createdAt, data };
  save(store);
  return createdAt;
}
