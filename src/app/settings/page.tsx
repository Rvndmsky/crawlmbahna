"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ThemeToggle from "../theme-toggle";

type Preset = "anthropic" | "openrouter" | "custom";

const PRESETS: Record<
  Preset,
  { label: string; provider: "anthropic" | "openai"; baseURL: string; model: string; note: string }
> = {
  anthropic: {
    label: "Anthropic (Claude)",
    provider: "anthropic",
    baseURL: "",
    model: "claude-opus-4-8",
    note: "Web search bawaan (paling akurat). Key dari console.anthropic.com.",
  },
  openrouter: {
    label: "OpenRouter",
    provider: "openai",
    baseURL: "https://openrouter.ai/api/v1",
    model: "openai/gpt-4o-mini",
    note: "Bebas pilih ratusan model. Web live via plugin. Key dari openrouter.ai/keys.",
  },
  custom: {
    label: "OpenAI-compatible (custom)",
    provider: "openai",
    baseURL: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    note: "Endpoint OpenAI-compatible apa pun. Web search hanya jalan bila server dukung plugin.",
  },
};

export default function SettingsPage() {
  const router = useRouter();
  const [preset, setPreset] = useState<Preset>("anthropic");
  const [baseURL, setBaseURL] = useState("");
  const [model, setModel] = useState("claude-opus-4-8");
  const [apiKey, setApiKey] = useState("");
  const [webSearch, setWebSearch] = useState(true);
  const [keyMasked, setKeyMasked] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) => {
        const p: Preset =
          s.provider === "anthropic"
            ? "anthropic"
            : s.baseURL?.includes("openrouter")
            ? "openrouter"
            : "custom";
        setPreset(p);
        setBaseURL(s.baseURL || "");
        setModel(s.model || "");
        setWebSearch(!!s.webSearch);
        setKeyMasked(s.keyMasked || "");
        setHasKey(!!s.hasKey);
      })
      .catch(() => {});
  }, []);

  function applyPreset(p: Preset) {
    setPreset(p);
    setBaseURL(PRESETS[p].baseURL);
    setModel(PRESETS[p].model);
  }

  async function save() {
    setErr(null);
    setSaved(false);
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: PRESETS[preset].provider,
        baseURL,
        model,
        apiKey, // kosong = pertahankan key lama
        webSearch,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setErr(json.error || "gagal menyimpan");
      return;
    }
    setKeyMasked(json.keyMasked);
    setHasKey(json.hasKey);
    setApiKey("");
    setSaved(true);
  }

  const isAnthropic = PRESETS[preset].provider === "anthropic";

  return (
    <>
      <header className="topbar">
        <div className="logo" style={{ cursor: "pointer" }} onClick={() => router.push("/")}>
          mbah<span className="dot">na</span>
        </div>
        <div style={{ flex: 1, fontWeight: 600 }}>⚙ Setup AI Provider</div>
        <ThemeToggle />
        <button onClick={() => router.push("/")}>← Dashboard</button>
      </header>

      <div className="wrap" style={{ maxWidth: 620 }}>
        <div className="form-group">
          <label>Provider</label>
          <div className="preset-row">
            {(Object.keys(PRESETS) as Preset[]).map((p) => (
              <button
                key={p}
                className={`preset ${preset === p ? "active" : ""}`}
                onClick={() => applyPreset(p)}
              >
                {PRESETS[p].label}
              </button>
            ))}
          </div>
          <div className="hint">{PRESETS[preset].note}</div>
        </div>

        {!isAnthropic && (
          <div className="form-group">
            <label>Base URL</label>
            <input value={baseURL} onChange={(e) => setBaseURL(e.target.value)} />
          </div>
        )}

        <div className="form-group">
          <label>Model</label>
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={isAnthropic ? "claude-opus-4-8" : "openai/gpt-4o-mini"}
          />
          <div className="hint">
            {isAnthropic
              ? "mis. claude-opus-4-8, claude-sonnet-5"
              : "mis. openai/gpt-4o, anthropic/claude-3.7-sonnet, perplexity/sonar (OpenRouter)"}
          </div>
        </div>

        <div className="form-group">
          <label>API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={hasKey ? `tersimpan: ${keyMasked} (kosongkan = tetap)` : "tempel API key"}
          />
        </div>

        <div className="form-group">
          <label className="check">
            <input
              type="checkbox"
              checked={webSearch}
              onChange={(e) => setWebSearch(e.target.checked)}
            />
            Aktifkan web search live (Anthropic tool / OpenRouter web plugin)
          </label>
        </div>

        {err && <div className="error">⚠ {err}</div>}
        {saved && <div className="ok-box">✓ Tersimpan. Provider aktif.</div>}

        <button className="save-btn" onClick={save}>
          Simpan
        </button>

        <div className="hint" style={{ marginTop: 20 }}>
          ⚠ Key disimpan lokal di <code>data/settings.json</code> pada mesin ini
          (folder <code>data/</code> di-gitignore). Jangan commit / bagikan.
        </div>
      </div>
    </>
  );
}
