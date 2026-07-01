"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ThemeToggle from "../theme-toggle";

type Actor = { nama: string; peran: string; afiliasi: string };
type ChronoItem = { waktu: string; peristiwa: string };
type RelatedSource = { title: string; url: string; source: string };
type Dossier = {
  image: string;
  headline: string;
  ringkasan: string;
  skorAlasan: string;
  kredibilitas: string;
  verifikasi: string;
  status: string;
  urgency: number;
  kategori: string;
  sentiment: "positive" | "negative" | "neutral";
  threat: string;
  threatLevel: number;
  aktor: Actor[];
  organisasi: string[];
  lokasi: string[];
  kronologi: ChronoItem[];
  faktaKunci: string[];
  reaksiPublik: string;
  implikasi: string[];
  rekomendasiPantau: string[];
  sumberTerkait: RelatedSource[];
};
type DossierResult = {
  url: string;
  title: string;
  generatedAt: number;
  cached: boolean;
  dossier: Dossier;
  error?: string;
};

const URG = ["Rendah", "Perlu dicatat", "Serius", "Kritis"];
const KRED: Record<string, { label: string; cls: string }> = {
  kredibel: { label: "✓ Kredibel", cls: "positive" },
  perlu_verifikasi: { label: "⚠ Perlu Verifikasi", cls: "neutral" },
  terindikasi_hoaks: { label: "✕ Terindikasi Hoaks", cls: "negative" },
};

function Chips({ items }: { items: string[] }) {
  if (!items?.length) return <span className="muted">—</span>;
  return (
    <div className="chips">
      {items.map((x, i) => (
        <span className="chip" key={i}>
          {x}
        </span>
      ))}
    </div>
  );
}

function Detail() {
  const params = useSearchParams();
  const router = useRouter();
  const url = params.get("url") || "";
  const title = params.get("title") || "";
  const source = params.get("source") || "";
  const platform = params.get("platform") || "web";
  const heat = params.get("heat") || "";
  const subject = params.get("subject") || "";

  const [data, setData] = useState<DossierResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

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
    const to = setTimeout(() => ctrl.abort(), 180000);
    try {
      const p = new URLSearchParams({ url, title });
      if (heat) p.set("heat", heat);
      if (subject) p.set("subject", subject);
      if (fresh) p.set("fresh", "1");
      const res = await fetch(`/api/dossier?${p.toString()}`, {
        signal: ctrl.signal,
      });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const json = (await res.json()) as DossierResult;
      if (!res.ok) throw new Error(json.error || "gagal menyusun dossier");
      setData(json);
    } catch (e: any) {
      setError(
        e?.name === "AbortError"
          ? "Terlalu lama menyusun dossier. Coba lagi."
          : e?.message || "gagal"
      );
    } finally {
      clearInterval(timer);
      clearTimeout(to);
      setLoading(false);
    }
  }

  useEffect(() => {
    if (url || title) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, subject]);

  const d = data?.dossier;

  return (
    <>
      <header className="topbar">
        <div className="logo" style={{ cursor: "pointer" }} onClick={() => router.push("/")}>
          mbah<span className="dot">na</span>
        </div>
        <div style={{ flex: 1, fontWeight: 600 }}>📑 Dossier Monitoring</div>
        <button className="refresh" onClick={() => load(true)} disabled={loading}>
          ↻
        </button>
        <ThemeToggle />
        <button onClick={() => router.back()}>← Kembali</button>
      </header>

      <div className="wrap" style={{ maxWidth: 900 }}>
        <div className="dossier-src-line">
          <span className="platform">{platform}</span> {source}
          {url && (
            <>
              {" · "}
              <a href={url} target="_blank" rel="noreferrer">
                sumber asli ↗
              </a>
            </>
          )}
        </div>
        <h1 className="dossier-title">{title}</h1>

        {loading && (
          <div className="state">
            <div className="spinner" />
            Menyusun dossier intelijen… <b>{elapsed}s</b>
          </div>
        )}
        {error && <div className="error">⚠ {error}</div>}

        {d && !loading && (
          <>
            {d.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="dossier-img"
                src={d.image}
                alt={title}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            )}

            {/* Baris status */}
            <div className="dossier-flags">
              <span className={`sent ${(KRED[d.kredibilitas] || KRED.perlu_verifikasi).cls}`}>
                {(KRED[d.kredibilitas] || KRED.perlu_verifikasi).label}
              </span>
              <span className={`sent ${d.sentiment}`}>{d.sentiment}</span>
              <span className="flag">status: {d.status}</span>
              <span className="flag">urgensi: {URG[d.urgency] || d.urgency}</span>
              {d.kategori && <span className="flag">{d.kategori}</span>}
              {d.threat !== "none" && (
                <span className="threat-badge">
                  🚨 {d.threat} · lvl {d.threatLevel}
                </span>
              )}
              {data?.cached && <span className="badge-cache">cache</span>}
            </div>

            {d.ringkasan && (
              <div className="panel">
                <div className="panel-title">Ringkasan Situasi</div>
                <div className="summary">{d.ringkasan}</div>
              </div>
            )}

            {d.skorAlasan && (
              <div className="panel panel-score">
                <div className="panel-title">
                  Analisis Skor Intensitas{heat ? ` — 🔥 ${heat}/100` : ""}
                </div>
                <div className="summary">{d.skorAlasan}</div>
              </div>
            )}

            <div className={`panel panel-kred kred-${d.kredibilitas}`}>
              <div className="panel-title">
                Validasi Kredibilitas —{" "}
                {(KRED[d.kredibilitas] || KRED.perlu_verifikasi).label}
              </div>
              <div className="summary">
                {d.verifikasi || "Belum ada dasar verifikasi yang cukup."}
              </div>
            </div>

            <div className="dossier-grid">
              <div className="panel">
                <div className="panel-title">Aktor / Tokoh</div>
                {d.aktor.length ? (
                  <ul className="actor-list">
                    {d.aktor.map((a, i) => (
                      <li key={i}>
                        <b>{a.nama}</b>
                        {a.peran ? ` — ${a.peran}` : ""}
                        {a.afiliasi ? <span className="muted"> ({a.afiliasi})</span> : ""}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="muted">—</span>
                )}
              </div>
              <div className="panel">
                <div className="panel-title">Organisasi / Lembaga</div>
                <Chips items={d.organisasi} />
                <div className="panel-title" style={{ marginTop: 16 }}>
                  Lokasi
                </div>
                <Chips items={d.lokasi} />
              </div>
            </div>

            {d.kronologi.length > 0 && (
              <div className="panel">
                <div className="panel-title">Kronologi</div>
                <ul className="chrono">
                  {d.kronologi.map((k, i) => (
                    <li key={i}>
                      <span className="chrono-time">{k.waktu || "—"}</span>
                      <span>{k.peristiwa}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {d.faktaKunci.length > 0 && (
              <div className="panel">
                <div className="panel-title">Fakta Kunci</div>
                <ul className="bullets">
                  {d.faktaKunci.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </div>
            )}

            {d.reaksiPublik && (
              <div className="panel">
                <div className="panel-title">Reaksi Publik</div>
                <div className="summary">{d.reaksiPublik}</div>
              </div>
            )}

            <div className="dossier-grid">
              {d.implikasi.length > 0 && (
                <div className="panel">
                  <div className="panel-title">Implikasi</div>
                  <ul className="bullets">
                    {d.implikasi.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                </div>
              )}
              {d.rekomendasiPantau.length > 0 && (
                <div className="panel panel-rec">
                  <div className="panel-title">Rekomendasi Pantau</div>
                  <ul className="bullets">
                    {d.rekomendasiPantau.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {d.sumberTerkait.length > 0 && (
              <div className="panel">
                <div className="panel-title">Sumber Terkait</div>
                <div className="sources">
                  {d.sumberTerkait.map((s, i) => (
                    <a key={i} href={s.url} target="_blank" rel="noreferrer">
                      {s.source ? `[${s.source}] ` : ""}
                      {s.title || s.url}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

export default function DetailPage() {
  return (
    <Suspense fallback={<div className="state">memuat…</div>}>
      <Detail />
    </Suspense>
  );
}
