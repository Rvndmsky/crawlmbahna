import { NextResponse } from "next/server";
import { readSettings } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Pemeriksa sementara: memastikan deployment mana yang melayani domain dan
// apakah Environment Variable sudah terbaca. TIDAK membocorkan nilainya —
// hanya ada/tidak ada, plus panjangnya untuk mendeteksi spasi nyasar.
// Hapus berkas ini setelah masalahnya beres.
export async function GET() {
  const info = (k: string) => {
    const v = process.env[k];
    return { ada: !!v, panjang: v ? v.length : 0 };
  };

  const s = readSettings();
  return NextResponse.json({
    // Setelan AI yang sedang dipakai (tanpa API key).
    ai: {
      provider: s.provider,
      model: s.model,
      baseURL: s.baseURL,
      webSearch: s.webSearch,
      adaKey: !!s.apiKey,
    },
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "(bukan Vercel)",
    environment: process.env.VERCEL_ENV || "(lokal)",
    env: {
      FB_WORKER_TOKEN: info("FB_WORKER_TOKEN"),
      UPSTASH_REDIS_REST_URL: info("UPSTASH_REDIS_REST_URL"),
      UPSTASH_REDIS_REST_TOKEN: info("UPSTASH_REDIS_REST_TOKEN"),
      AUTH_SECRET: info("AUTH_SECRET"),
    },
    // Nama ENV apa saja yang mirip, untuk menangkap salah ketik.
    kunciMirip: Object.keys(process.env)
      .filter((k) => /FB|WORKER|UPSTASH|REDIS|KV_|STORAGE|DATABASE/i.test(k))
      .sort(),
  });
}
