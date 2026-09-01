"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ThemeToggle from "./theme-toggle";
import IndonesiaMap from "./id-map";
import { makeDetailSlug } from "@/lib/slug";
import { resolveCoord } from "@/lib/geo";

type Sent = "positive" | "negative" | "neutral";
type TrendSource = {
  title: string;
  url: string;
  source: string;
  platform: string;
  published: string;
};
type TrendTopic = {
  topic: string;
  category: string;
  heat: number;
  summary: string;
  sentiment: Sent;
  threat: string;
  threatLevel: number;
  breaking: boolean;
  sources: TrendSource[];
};
type CityItem = {
  kota: string;
  provinsi: string;
  headline: string;
  summary: string;
  heat: number;
  sentiment: Sent;
  url: string;
  source: string;
  platform: string;
  lat: number;
  lon: number;
};
type Intel = {
  date: string;
  generatedAt: number;
  cached: boolean;
  topics: TrendTopic[];
  cities: CityItem[];
  error?: string;
};

const SENT_COLORS: Record<Sent, string> = {
  positive: "#2ea043",
  negative: "#e5534b",
  neutral: "#8b949e",
};

function fmtTime(ms: number) {
  try {
    return new Date(ms).toLocaleString("id-ID");
  } catch {
    return "";
  }
}

/* Donut SVG tanpa library */
function Donut({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const R = 60;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 150 150" width="150" height="150">
        <g transform="rotate(-90 75 75)">
          {data.map((d, i) => {
            const frac = d.value / total;
            const len = frac * C;
            const seg = (
              <circle
                key={i}
                cx="75"
                cy="75"
                r={R}
                fill="none"
                stroke={d.color}
                strokeWidth="22"
                strokeDasharray={`${len} ${C - len}`}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return seg;
          })}
        </g>
        <text x="75" y="72" textAnchor="middle" className="donut-total">
          {total}
        </text>
        <text x="75" y="90" textAnchor="middle" className="donut-sub">
          isu
        </text>
      </svg>
      <div className="donut-legend">
        {data.map((d, i) => (
          <div key={i}>
            <span className="dot-c" style={{ background: d.color }} />
            {d.label} <b>{d.value}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Bar chart horizontal sederhana */
function Bars({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="bars">
      {data.map((d, i) => (
        <div className="bar-row" key={i}>
          <span className="bar-label">{d.label}</span>
          <div className="bar-track">
            <div
              className="bar-fill"
              style={{ width: `${(d.value / max) * 100}%` }}
            />
          </div>
          <span className="bar-val">{d.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function IntelDashboard() {
  const router = useRouter();
  const [data, setData] = useState<Intel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [bidx, setBidx] = useState(0);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  function goDetail(subject: string, heat: number, url?: string, title?: string) {
    const dateCompact = (data?.date || "").replace(/-/g, "");
    const slug = makeDetailSlug(title || subject, dateCompact);
    const p = new URLSearchParams();
    if (heat) p.set("h", String(heat));
    if (url) p.set("u", url);
    if (title) p.set("t", title);
    const qs = p.toString();
    router.push(`/detail/${slug}${qs ? `?${qs}` : ""}`);
  }
  function openTopic(t: TrendTopic) {
    // Anchor ke artikel sumber utama supaya dossier sesuai berita ini.
    goDetail(t.topic, t.heat, t.sources?.[0]?.url || "", t.topic);
  }
  function openCity(name: string, heat: number, url?: string, title?: string) {
    goDetail(name, heat, url, title);
  }

  async function load(fresh = false) {
    setLoading(true);
    setError(null);
    setData(null);
    setElapsed(0);
    const started = Date.now();
    const timer = setInterval(
      () => setElapsed(Math.round((Date.now() - started) / 1000)),
      1000
    );
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 220000); // batas 220 dtk
    try {
      const res = await fetch(`/api/trending${fresh ? "?fresh=1" : ""}`, {
        signal: ctrl.signal,
      });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const json = (await res.json()) as Intel;
      if (!res.ok) throw new Error(json.error || "gagal memuat");
      setData(json);
    } catch (e: any) {
      setError(
        e?.name === "AbortError"
          ? "Terlalu lama (>3 menit). Coba refresh, atau pilih model lebih cepat di ⚙ Setup."
          : e?.message || "gagal memuat"
      );
    } finally {
      clearInterval(timer);
      clearTimeout(to);
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // Auto-refresh tiap 30 menit -> berita/isu baru muncul otomatis.
    const iv = setInterval(() => load(), 30 * 60 * 1000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    if (!data) return null;
    const sent = { positive: 0, negative: 0, neutral: 0 };
    const cat: Record<string, number> = {};
    for (const t of data.topics) {
      sent[t.sentiment]++;
      cat[t.category] = (cat[t.category] || 0) + 1;
    }
    const dominant = (Object.entries(sent).sort((a, b) => b[1] - a[1])[0]?.[0] ||
      "neutral") as Sent;
    const threats = data.topics
      .filter((t) => t.threat !== "none" || t.threatLevel > 0)
      .sort((a, b) => b.threatLevel - a.threatLevel);
    const breaking = data.topics.filter((t) => t.breaking);
    return {
      breaking,
      sent,
      catBars: Object.entries(cat)
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value),
      dominant,
      hottest: data.topics[0]?.topic || "-",
      threats,
    };
  }, [data]);

  // Titik peta (stabil — hanya berubah saat data berubah, bukan tiap tick).
  const mapPoints = useMemo(() => {
    if (!data) return [];
    return data.cities
      .slice(0, 8)
      .map((c) => {
        const co = resolveCoord(c.kota, c.provinsi, c.lat, c.lon);
        if (!co) return null;
        return {
          name: c.kota,
          heat: c.heat,
          sentiment: c.sentiment,
          headline: c.headline,
          lat: co[0],
          lon: co[1],
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [data]);

  // Rotasi breaking news (slideshow) tiap 4 detik.
  const breakingLen = stats?.breaking.length || 0;
  useEffect(() => {
    if (breakingLen <= 1) return;
    const iv = setInterval(() => setBidx((i) => (i + 1) % breakingLen), 4000);
    return () => clearInterval(iv);
  }, [breakingLen]);

  return (
    <div className="intel">
      <header className="intel-top">
        <div className="brand-row">
          <div className="logo">
            mbah<span className="dot">na</span>
          </div>
          <span className="sub-brand">Website Crawl Simple Membantu Pemerintah RI</span>
        </div>
        <div style={{ flex: 1 }} />
        <ThemeToggle />
        <button
          className="refresh"
          title="pantau individu (threads/ig/x)"
          onClick={() => router.push("/gettargetmbahna")}
        >
          🎯
        </button>
        <button
          className="refresh"
          title="infografis dari dokumen"
          onClick={() => router.push("/infografis")}
        >
          🖼
        </button>
        <button
          className="refresh"
          title="pantau Facebook (isu & gerakan)"
          onClick={() => router.push("/facebook")}
        >
          📘
        </button>
        <button className="refresh" onClick={() => load(true)} disabled={loading}>
          ↻
        </button>
        <button className="refresh" title="setup AI" onClick={() => router.push("/settings")}>
          ⚙
        </button>
        <button className="refresh" title="keluar" onClick={logout}>
          ⏻
        </button>
      </header>

      <div className="intel-body">
        {/* Search bar utama (di body, gaya Google) */}
        <div className="hero">
          <div className="hero-brand">
            mbah<span className="dot">na</span>
          </div>
          <form
            className="big-search"
            onSubmit={(e) => {
              e.preventDefault();
              const s = q.trim();
              if (s) router.push(`/search?q=${encodeURIComponent(s)}`);
            }}
          >
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="cari berita…"
              autoFocus
            />
            <button type="submit">Cari</button>
          </form>
        </div>

        {loading && (
          <div className="state">
            <div className="spinner" />
            Menyusun peta intelijen hari ini… <b>{elapsed}s</b>
            <div style={{ fontSize: 13, marginTop: 8 }}>
              Pertama kali biasanya 40–120 detik (menyisir berita nasional &amp;
              per provinsi). Berikutnya instan dari cache harian.
            </div>
          </div>
        )}

        {error && <div className="error">⚠ {error}</div>}

        {data && stats && !loading && (
          <>
            {stats.breaking.length > 0 &&
              (() => {
                const cur = stats.breaking[bidx % stats.breaking.length];
                return (
                  <div className="breaking">
                    <span className="breaking-tag">
                      <span className="live-dot" /> BREAKING
                    </span>
                    <div className="breaking-slider">
                      <span
                        className="breaking-slide"
                        key={bidx}
                        onClick={() => openTopic(cur)}
                      >
                        {cur.threat !== "none" && "🚨 "}
                        {cur.topic}
                      </span>
                    </div>
                    {stats.breaking.length > 1 && (
                      <span className="breaking-count">
                        {(bidx % stats.breaking.length) + 1}/{stats.breaking.length}
                      </span>
                    )}
                  </div>
                );
              })()}

            <div className="meta">
              Snapshot {data.date}
              {data.cached && <span className="badge-cache">cache harian</span>}
              {data.generatedAt ? ` · diperbarui ${fmtTime(data.generatedAt)}` : ""}
            </div>

            {/* Kartu statistik */}
            <div className="stat-cards">
              <div className="stat">
                <div className="stat-num">{data.topics.length}</div>
                <div className="stat-lbl">Isu nasional terpantau</div>
              </div>
              <div className="stat">
                <div className="stat-num">{data.cities.length}</div>
                <div className="stat-lbl">Kota/Kab terpantau</div>
              </div>
              <div className="stat">
                <div className="stat-num" style={{ color: SENT_COLORS[stats.dominant] }}>
                  {stats.dominant}
                </div>
                <div className="stat-lbl">Sentimen dominan</div>
              </div>
              <div className="stat">
                <div
                  className="stat-num"
                  style={{ color: stats.threats.length ? SENT_COLORS.negative : SENT_COLORS.neutral }}
                >
                  {stats.threats.length}
                </div>
                <div className="stat-lbl">🚨 Ancaman kedaulatan</div>
              </div>
            </div>

            {/* Alert ancaman kedaulatan (prioritas) */}
            {stats.threats.length > 0 && (
              <>
                <div className="section-title alert-title">
                  🚨 ANCAMAN KEDAULATAN NKRI
                </div>
                {stats.threats.map((t, i) => (
                  <article className="alert-card clickable" key={i} onClick={() => openTopic(t)}>
                    <div className="head">
                      <span className="threat-badge">
                        {t.threat} · level {t.threatLevel}
                      </span>
                      <span className="platform">{t.category}</span>
                      <span className="heat-num">🔥 {t.heat}</span>
                    </div>
                    <div className="title">{t.topic}</div>
                    {t.summary && <div className="summary">{t.summary}</div>}
                    <div className="sources">
                      {t.sources.map((s, j) => (
                        <a key={j} href={s.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                          [{s.platform}] {s.source || s.title}
                        </a>
                      ))}
                      <span className="dossier-link">📑 dossier →</span>
                    </div>
                  </article>
                ))}
              </>
            )}

            {/* Grafik */}
            <div className="charts">
              <div className="panel">
                <div className="panel-title">Distribusi Sentimen</div>
                <Donut
                  data={[
                    { label: "positive", value: stats.sent.positive, color: SENT_COLORS.positive },
                    { label: "negative", value: stats.sent.negative, color: SENT_COLORS.negative },
                    { label: "neutral", value: stats.sent.neutral, color: SENT_COLORS.neutral },
                  ]}
                />
              </div>
              <div className="panel">
                <div className="panel-title">Isu per Kategori</div>
                <Bars data={stats.catBars} />
              </div>
            </div>

            {/* Peta sebaran isu */}
            <div className="panel">
              <div className="panel-title">🗺️ Peta Sebaran Isu (Kota/Kabupaten)</div>
              <IndonesiaMap points={mapPoints} onSelect={(pt) => openCity(pt.name, pt.heat)} />
            </div>

            {/* Kartu kota/kabupaten */}
            <div className="section-title">📍 Berita per Kota / Kabupaten</div>
            <div className="prov-grid">
              {data.cities.slice(0, 8).map((c, i) => (
                <div
                  className="prov-card clickable"
                  key={i}
                  onClick={() => openCity(c.kota, c.heat, c.url, c.headline)}
                >
                  <div className="prov-head">
                    <b>{c.kota}</b>
                    <span className={`sent ${c.sentiment}`}>{c.sentiment}</span>
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                    {c.provinsi}
                  </div>
                  <div className="prov-headline">{c.headline}</div>
                  <div className="heatbar">
                    <div className="heatbar-fill" style={{ width: `${c.heat}%` }} />
                  </div>
                  <div className="prov-src">
                    [{c.platform}] {c.source} · 🔥 {c.heat} · 📑 dossier
                  </div>
                </div>
              ))}
            </div>

            {/* Isu nasional terpanas */}
            <div className="section-title">🔥 Isu Nasional Terkini</div>
            {data.topics.slice(0, 10).map((t, i) => (
              <article className="trend clickable" key={i} onClick={() => openTopic(t)}>
                <div className="rank">#{i + 1}</div>
                <div className="trend-body">
                  <div className="head">
                    <span className="platform">{t.category}</span>
                    {t.threat !== "none" && (
                      <span className="threat-badge sm">🚨 {t.threat}</span>
                    )}
                    <span className={`sent ${t.sentiment}`}>{t.sentiment}</span>
                    <span className="heat-num">🔥 {t.heat}</span>
                  </div>
                  <div className="title">{t.topic}</div>
                  <div className="heatbar">
                    <div className="heatbar-fill" style={{ width: `${t.heat}%` }} />
                  </div>
                  {t.summary && <div className="summary">{t.summary}</div>}
                  <div className="sources">
                    {t.sources.map((s, j) => (
                      <a key={j} href={s.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                        [{s.platform}] {s.source || s.title}
                      </a>
                    ))}
                    <span className="dossier-link">📑 dossier →</span>
                  </div>
                </div>
              </article>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
