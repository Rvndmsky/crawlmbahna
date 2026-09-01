import Anthropic from "@anthropic-ai/sdk";
import { readSettings, type Peran } from "./config";

// Ekstrak objek JSON pertama dari teks (buang code fence / prosa).
export function extractJson(text: string): any | null {
  let t = text.trim();
  t = t.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    return null;
  }
}

// ---------- Anthropic (web_search / web_fetch server tools) ----------
async function runAnthropic(
  system: string,
  userText: string,
  maxTokens: number,
  settings?: ReturnType<typeof readSettings>
): Promise<string> {
  const s = settings || readSettings();
  const client = new Anthropic({ apiKey: s.apiKey });
  const tools = s.webSearch
    ? [
        { type: "web_search_20260209", name: "web_search", max_uses: 8 },
        { type: "web_fetch_20260209", name: "web_fetch", max_uses: 5 },
      ]
    : undefined;

  const messages: any[] = [{ role: "user", content: userText }];
  let resp: any;
  for (let i = 0; i < 6; i++) {
    resp = await client.messages.create({
      model: s.model,
      max_tokens: maxTokens,
      system,
      thinking: { type: "adaptive" },
      ...(tools ? { tools } : {}),
      messages,
    } as any);
    if (resp.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: resp.content });
      continue;
    }
    break;
  }
  return (resp.content || [])
    .filter((b: any) => b.type === "text" && typeof b.text === "string")
    .map((b: any) => b.text)
    .join("\n");
}

// ---------- OpenAI-compatible (OpenRouter dll) ----------
async function runOpenAI(
  system: string,
  userText: string,
  maxTokens: number,
  settings?: ReturnType<typeof readSettings>
): Promise<string> {
  const s = settings || readSettings();
  const base = s.baseURL.replace(/\/+$/, "");
  const body: any = {
    model: s.model,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userText },
    ],
  };
  // OpenRouter web plugin: cari live sebelum menjawab. Diabaikan endpoint lain.
  if (s.webSearch) body.plugins = [{ id: "web", max_results: 5 }];

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${s.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "mbahna",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`provider ${res.status}: ${t.slice(0, 300)}`);
  }
  const json: any = await res.json();
  return json?.choices?.[0]?.message?.content || "";
}

// Jalankan riset web sesuai provider terpilih; kembalikan teks final.
export async function runWeb(
  system: string,
  userText: string,
  maxTokens = 8000,
  peran?: Peran
): Promise<string> {
  const s = readSettings(peran);
  if (!s.apiKey) throw new Error("API key belum di-set. Buka /settings.");
  return s.provider === "anthropic"
    ? runAnthropic(system, userText, maxTokens, s)
    : runOpenAI(system, userText, maxTokens, s);
}

// Sama seperti runWeb, tapi TANPA pencarian web. Dipakai bila bahannya sudah
// ada di depan mata (mis. isi dokumen yang diunggah) — lebih cepat & murah.
export async function runOffline(
  system: string,
  userText: string,
  maxTokens = 8000,
  peran?: Peran
): Promise<string> {
  const s = readSettings(peran);
  if (!s.apiKey) throw new Error("API key belum di-set. Buka /settings.");
  const tanpaTool = { ...s, webSearch: false };
  return s.provider === "anthropic"
    ? runAnthropic(system, userText, maxTokens, tanpaTool)
    : runOpenAI(system, userText, maxTokens, tanpaTool);
}
