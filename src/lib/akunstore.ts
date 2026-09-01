import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Penyimpanan jumlah pengikut akun media sosial.
//
// Angkanya tidak bisa diambil server: halaman profil dirender JavaScript, dan
// Vercel tidak menjalankan browser. Jadi alurnya seperti Facebook — worker
// Chromium yang membuka profil (TANPA login; Instagram, Threads, TikTok, dan
// YouTube menampilkan jumlah pengikut ke pengunjung anonim), lalu mengirim
// hasilnya ke sini.
//
// Aplikasi menaruh URL profil yang belum punya angka ke ANTRIAN; worker
// mengambil antrian itu, membacanya, lalu mengirim balik.

export type PostAkun = {
  url: string; // permalink postingan
  content: string; // teks postingan bila terbaca (Threads); kosong di Instagram
};

export type DataAkun = {
  url: string; // URL profil
  followers: string; // teks apa adanya, mis. "55,8 jt"
  posts: PostAkun[]; // permalink postingan terbaru dari profil itu
  diperbaruiPada: number;
};

const DATA_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), "mbahna-data")
  : path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "akun-followers.json");

const REDIS_URL = (process.env.UPSTASH_REDIS_REST_URL || "").replace(/\/+$/, "");
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";
const pakaiRedis = !!(REDIS_URL && REDIS_TOKEN);

const KUNCI_DATA = "akun:followers";
const KUNCI_ANTRIAN = "akun:antrian";
const MAKS_ANTRIAN = 60;

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
  if (!res.ok) throw new Error(`upstash ${res.status}`);
  const json: any = await res.json();
  if (json?.error) throw new Error(`upstash: ${json.error}`);
  return json?.result;
}

type Berkas = { data: Record<string, DataAkun>; antrian: string[] };

function bacaBerkas(): Berkas {
  try {
    if (!fs.existsSync(FILE)) return { data: {}, antrian: [] };
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return { data: raw.data || {}, antrian: raw.antrian || [] };
  } catch {
    return { data: {}, antrian: [] };
  }
}

function tulisBerkas(b: Berkas) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(b, null, 2), "utf8");
  } catch {
    /* read-only FS: lewati */
  }
}

// Normalkan URL supaya profil yang sama tidak tersimpan dua kali.
export function kunciUrl(u: string): string {
  try {
    const x = new URL(u);
    return (x.hostname.replace(/^www\./, "") + x.pathname.replace(/\/+$/, "")).toLowerCase();
  } catch {
    return String(u || "").toLowerCase();
  }
}

// Titipkan URL profil yang belum punya angka pengikut.
export async function antreAkun(urls: string[]): Promise<void> {
  const bersih = urls.filter((u) => /^https?:\/\//i.test(u)).slice(0, 20);
  if (!bersih.length) return;

  if (pakaiRedis) {
    try {
      await redis(["SADD", KUNCI_ANTRIAN, ...bersih]);
    } catch {
      /* antrian gagal ditulis: bukan alasan menggagalkan penyisiran */
    }
    return;
  }
  const b = bacaBerkas();
  b.antrian = Array.from(new Set([...b.antrian, ...bersih])).slice(-MAKS_ANTRIAN);
  tulisBerkas(b);
}

export async function ambilAntrian(): Promise<string[]> {
  if (pakaiRedis) {
    try {
      const v: string[] = (await redis(["SMEMBERS", KUNCI_ANTRIAN])) || [];
      return v.slice(0, MAKS_ANTRIAN);
    } catch {
      return [];
    }
  }
  return bacaBerkas().antrian.slice(0, MAKS_ANTRIAN);
}

export async function simpanFollowers(items: DataAkun[]): Promise<number> {
  const sah = items.filter((i) => i.url && (i.followers || i.posts?.length));
  if (!sah.length) return 0;

  if (pakaiRedis) {
    const pasangan: string[] = [];
    for (const i of sah) pasangan.push(kunciUrl(i.url), JSON.stringify(i));
    await redis(["HSET", KUNCI_DATA, ...pasangan]);
    // URL yang sudah terbaca dikeluarkan dari antrian.
    await redis(["SREM", KUNCI_ANTRIAN, ...sah.map((i) => i.url)]);
    return sah.length;
  }

  const b = bacaBerkas();
  for (const i of sah) b.data[kunciUrl(i.url)] = i;
  const selesai = new Set(sah.map((i) => kunciUrl(i.url)));
  b.antrian = b.antrian.filter((u) => !selesai.has(kunciUrl(u)));
  tulisBerkas(b);
  return sah.length;
}

// Ambil angka pengikut untuk sekumpulan URL profil.
export async function ambilFollowers(
  urls: string[]
): Promise<Record<string, DataAkun>> {
  const kunci = urls.map(kunciUrl).filter(Boolean);
  if (!kunci.length) return {};

  if (pakaiRedis) {
    try {
      const v: any[] = (await redis(["HMGET", KUNCI_DATA, ...kunci])) || [];
      const out: Record<string, DataAkun> = {};
      v.forEach((raw, i) => {
        if (!raw) return;
        try {
          out[kunci[i]] = typeof raw === "string" ? JSON.parse(raw) : raw;
        } catch {
          /* entri rusak: lewati */
        }
      });
      return out;
    } catch {
      return {};
    }
  }

  const b = bacaBerkas();
  const out: Record<string, DataAkun> = {};
  for (const k of kunci) if (b.data[k]) out[k] = b.data[k];
  return out;
}
