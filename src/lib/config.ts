import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Konfigurasi AI provider, disimpan lokal di data/settings.json.
// Prototype/lokal: key disimpan plaintext di disk mesin ini saja (data/ di-gitignore).

export type Provider = "anthropic" | "openai";

export type Settings = {
  provider: Provider; // "openai" mencakup OpenRouter & endpoint OpenAI-compatible
  apiKey: string;
  baseURL: string; // dipakai provider "openai"
  model: string;
  webSearch: boolean; // true = pakai web search (Anthropic tool / OpenRouter web plugin)
};

const DATA_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), "mbahna-data")
  : path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "settings.json");

function envDefaults(): Settings {
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const envProvider = process.env.AI_PROVIDER;
  const provider: Provider =
    envProvider === "openai" || envProvider === "anthropic"
      ? envProvider
      : hasAnthropic
      ? "anthropic"
      : "openai";
  return {
    provider,
    apiKey:
      process.env.ANTHROPIC_API_KEY ||
      process.env.OPENROUTER_API_KEY ||
      process.env.OPENAI_API_KEY ||
      "",
    baseURL: process.env.OPENAI_BASE_URL || "https://openrouter.ai/api/v1",
    model:
      process.env.AI_MODEL ||
      process.env.ANTHROPIC_MODEL ||
      (provider === "anthropic" ? "claude-opus-4-8" : "openai/gpt-4o-mini"),
    webSearch: process.env.AI_WEBSEARCH !== "false",
  };
}

// Bagian aplikasi yang memanggil model. Tiap bagian boleh memakai model
// berbeda lewat ENV AI_MODEL_<BAGIAN>; kalau tidak di-set, ikut AI_MODEL.
export type Peran =
  | "dashboard"
  | "search"
  | "target"
  | "dossier"
  | "infografis";

function modelPeran(peran?: Peran): string {
  if (!peran) return "";
  return process.env[`AI_MODEL_${peran.toUpperCase()}`] || "";
}

export function readSettings(peran?: Peran): Settings {
  const def = envDefaults();
  const timpa = modelPeran(peran);
  try {
    if (fs.existsSync(FILE)) {
      const saved = JSON.parse(fs.readFileSync(FILE, "utf8"));
      const gabung = { ...def, ...saved };
      return timpa ? { ...gabung, model: timpa } : gabung;
    }
  } catch {
    /* fallback ke env */
  }
  return timpa ? { ...def, model: timpa } : def;
}

export function writeSettings(partial: Partial<Settings>): Settings {
  const current = readSettings();
  const next: Settings = { ...current, ...partial };
  // apiKey kosong saat simpan = pertahankan yang lama
  if (!partial.apiKey) next.apiKey = current.apiKey;
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(next, null, 2), "utf8");
  } catch {
    /* serverless read-only: tak persist. Set via ENV di Vercel. */
  }
  return next;
}

export function maskKey(k: string): string {
  if (!k) return "";
  if (k.length <= 8) return "••••";
  return k.slice(0, 4) + "…" + k.slice(-4);
}
