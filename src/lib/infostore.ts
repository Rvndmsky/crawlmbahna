import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { InfoSpec } from "./infografis";

// Penyimpanan infografis yang sudah dibuat. Sama polanya dengan fbstore:
// Upstash Redis bila ENV-nya ada (wajib di Vercel), berkas lokal bila tidak.

export type InfoItem = {
  id: string;
  judul: string;
  kategori: string;
  namaBerkas: string;
  dibuatPada: number;
  spec: InfoSpec;
};

const DATA_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), "mbahna-data")
  : path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "infografis.json");
const SVG_DIR = path.join(DATA_DIR, "infografis");

const MAKS_ITEM = 60;

const REDIS_URL = (process.env.UPSTASH_REDIS_REST_URL || "").replace(/\/+$/, "");
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";
export const pakaiRedis = !!(REDIS_URL && REDIS_TOKEN);

const KUNCI_DAFTAR = "info:daftar";
const kunciSvg = (id: string) => `info:svg:${id}`;

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

export function idBaru(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  ).replace(/[^a-z0-9]/g, "");
}

function bacaBerkas(): InfoItem[] {
  try {
    if (!fs.existsSync(FILE)) return [];
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function tulisBerkas(list: InfoItem[]) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(list.slice(0, MAKS_ITEM), null, 2), "utf8");
  } catch {
    /* read-only FS: lewati */
  }
}

export async function simpanInfografis(item: InfoItem, svg: string): Promise<void> {
  if (pakaiRedis) {
    await redis(["SET", kunciSvg(item.id), svg]);
    await redis(["LPUSH", KUNCI_DAFTAR, JSON.stringify(item)]);
    await redis(["LTRIM", KUNCI_DAFTAR, 0, MAKS_ITEM - 1]);
    return;
  }
  try {
    if (!fs.existsSync(SVG_DIR)) fs.mkdirSync(SVG_DIR, { recursive: true });
    fs.writeFileSync(path.join(SVG_DIR, `${item.id}.svg`), svg, "utf8");
  } catch {
    /* read-only FS: lewati */
  }
  tulisBerkas([item, ...bacaBerkas()]);
}

export async function ambilSvg(id: string): Promise<string> {
  if (!id) return "";
  if (pakaiRedis) {
    const v = await redis(["GET", kunciSvg(id)]);
    return typeof v === "string" ? v : "";
  }
  try {
    const f = path.join(SVG_DIR, `${id}.svg`);
    return fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "";
  } catch {
    return "";
  }
}

// Hapus satu infografis beserta gambarnya.
export async function hapusInfografis(id: string): Promise<boolean> {
  if (!id) return false;

  if (pakaiRedis) {
    const sisa = (await daftarInfografis()).filter((x) => x.id !== id);
    await redis(["DEL", kunciSvg(id)]);
    await redis(["DEL", KUNCI_DAFTAR]);
    // Daftar ditulis ulang karena entri disimpan sebagai JSON di dalam list;
    // LREM butuh nilai yang sama persis, sedangkan hasil serialisasi bisa beda.
    for (const it of [...sisa].reverse()) {
      await redis(["LPUSH", KUNCI_DAFTAR, JSON.stringify(it)]);
    }
    return true;
  }

  const list = bacaBerkas();
  const sisa = list.filter((x) => x.id !== id);
  if (sisa.length === list.length) return false;
  tulisBerkas(sisa);
  try {
    const f = path.join(SVG_DIR, `${id}.svg`);
    if (fs.existsSync(f)) fs.unlinkSync(f);
  } catch {
    /* berkas gambar gagal dihapus: daftar sudah bersih, biarkan */
  }
  return true;
}

export async function daftarInfografis(): Promise<InfoItem[]> {
  if (pakaiRedis) {
    const raws: any[] = (await redis(["LRANGE", KUNCI_DAFTAR, 0, MAKS_ITEM - 1])) || [];
    return raws
      .map((r) => {
        try {
          return typeof r === "string" ? JSON.parse(r) : r;
        } catch {
          return null;
        }
      })
      .filter((x): x is InfoItem => !!x && !!x.id);
  }
  return bacaBerkas();
}
