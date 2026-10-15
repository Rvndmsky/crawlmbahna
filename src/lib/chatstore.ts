import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Riwayat percakapan chat Duryudana (per thread).
//
// DUA MODE, sama seperti fbstore:
// 1. Upstash Redis (UPSTASH_REDIS_REST_URL + TOKEN) — dipakai di Vercel.
// 2. Berkas data/duryudana-chats.json — saat aplikasi jalan lokal.

export type ChatPesan = { role: "user" | "assistant"; content: string };
export type ChatThread = { id: string; title: string; updatedAt: number };

const MAKS_THREAD = 100;
const MAKS_PESAN = 80;
const MAKS_PANJANG = 20000;

export const idValid = (id: unknown): id is string =>
  typeof id === "string" && /^[a-z0-9-]{8,40}$/.test(id);

export function bersihkanPesan(raw: unknown): ChatPesan[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatPesan[] = [];
  for (const m of raw.slice(-MAKS_PESAN)) {
    if (!m || (m.role !== "user" && m.role !== "assistant")) continue;
    if (typeof m.content !== "string" || !m.content.trim()) continue;
    out.push({ role: m.role, content: m.content.slice(0, MAKS_PANJANG) });
  }
  return out;
}

function judulDari(pesan: ChatPesan[]): string {
  const awal = pesan.find((m) => m.role === "user")?.content || "Percakapan baru";
  const satuBaris = awal.replace(/\s+/g, " ").trim();
  return satuBaris.length > 60 ? satuBaris.slice(0, 57) + "…" : satuBaris;
}

// ---------- Upstash Redis ----------
const REDIS_URL = (process.env.UPSTASH_REDIS_REST_URL || "").replace(/\/+$/, "");
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";
const usingRedis = !!(REDIS_URL && REDIS_TOKEN);

const KEY_META = "duryudana:threads"; // hash: id -> JSON ChatThread
const keyPesan = (id: string) => `duryudana:msg:${id}`;

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
type Berkas = Record<string, { meta: ChatThread; messages: ChatPesan[] }>;
const DATA_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), "mbahna-data")
  : path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "duryudana-chats.json");

function bacaBerkas(): Berkas {
  try {
    if (!fs.existsSync(FILE)) return {};
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}
function tulisBerkas(b: Berkas) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(b), "utf8");
}

// ---------- API ----------
export async function daftarThread(): Promise<ChatThread[]> {
  let semua: ChatThread[];
  if (usingRedis) {
    const flat: string[] = (await redis(["HGETALL", KEY_META])) || [];
    semua = [];
    for (let i = 1; i < flat.length; i += 2) {
      try {
        semua.push(JSON.parse(flat[i]));
      } catch {
        /* lewati entri rusak */
      }
    }
  } else {
    semua = Object.values(bacaBerkas()).map((t) => t.meta);
  }
  return semua.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function ambilThread(
  id: string
): Promise<{ meta: ChatThread; messages: ChatPesan[] } | null> {
  if (usingRedis) {
    const [meta, msgs] = await Promise.all([
      redis(["HGET", KEY_META, id]),
      redis(["GET", keyPesan(id)]),
    ]);
    if (!meta) return null;
    return { meta: JSON.parse(meta), messages: msgs ? JSON.parse(msgs) : [] };
  }
  return bacaBerkas()[id] || null;
}

export async function simpanThread(id: string, raw: unknown): Promise<ChatThread | null> {
  const messages = bersihkanPesan(raw);
  if (!messages.length) return null;
  const meta: ChatThread = { id, title: judulDari(messages), updatedAt: Date.now() };

  if (usingRedis) {
    await redis(["SET", keyPesan(id), JSON.stringify(messages)]);
    await redis(["HSET", KEY_META, id, JSON.stringify(meta)]);
    // Pangkas thread tertua bila melewati batas.
    const semua = await daftarThread();
    for (const lama of semua.slice(MAKS_THREAD)) await hapusThread(lama.id);
    return meta;
  }
  const b = bacaBerkas();
  b[id] = { meta, messages };
  const urut = Object.values(b).sort((x, y) => y.meta.updatedAt - x.meta.updatedAt);
  for (const lama of urut.slice(MAKS_THREAD)) delete b[lama.meta.id];
  tulisBerkas(b);
  return meta;
}

export async function hapusThread(id: string): Promise<void> {
  if (usingRedis) {
    await redis(["HDEL", KEY_META, id]);
    await redis(["DEL", keyPesan(id)]);
    return;
  }
  const b = bacaBerkas();
  delete b[id];
  tulisBerkas(b);
}
