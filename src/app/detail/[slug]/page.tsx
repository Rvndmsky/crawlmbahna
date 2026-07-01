"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import ThemeToggle from "../../theme-toggle";
import { parseDetailSlug, titleCase } from "@/lib/slug";

type RelatedSource = { title: string; url: string; source: string };
type Lokasi = { nama: string; lat: number; lon: number };
type Dossier = {
  image: string;
  headline: string;
  kredibilitas: string;
  verifikasi: string;
  status: string;
  urgency: number;
  kategori: string;
  sentiment: "positive" | "negative" | "neutral";
  threat: string;
  threatLevel: number;
  skorAlasan: string;
  kronologiFakta: string;
  analisa: string;
  dampak: string;
  upaya: string;
  saranTindakan: string[];
  lokasi: Lokasi[];
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
const gmaps = (lat: number, lon: number) =>
  `https://www.google.com/maps/search/?api=1&query=${lat}%2C${lon}`;
const gmapsEmbed = (lat: number, lon: number) =>
  `https://maps.google.com/maps?q=${lat},${lon}&z=15&output=embed`;
const KRED: Record<string, { label: string; cls: string }> = {
  kredibel: { label: "✓ Kredibel", cls: "positive" },
  perlu_verifikasi: { label: "⚠ Perlu Verifikasi", cls: "neutral" },
  terindikasi_hoaks: { label: "✕ Terindikasi Hoaks", cls: "negative" },
};

function fmtTime(ms: number) {
  try {
    return new Date(ms).toLocaleString("id-ID");
  } catch {
    return "";
  }
}
function Detail() {
  const params = useParams();
  const search = useSearchParams();
  const router = useRouter();
  const slug = String(params?.slug || "");
  const { subject, date } = parseDetailSlug(slug);
  const heat = search.get("h") || "";
  const srcUrl = search.get("u") || "";
  const providedTitle = search.get("t") || "";
  const title = providedTitle || titleCase(subject);

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
      const p = new URLSearchParams({ title: providedTitle || subject, subject });
      if (srcUrl) p.set("url", srcUrl); // baca artikel spesifik ini
      if (heat) p.set("heat", heat);
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
    if (subject) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

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
          Subjek pantauan{date ? ` · ${date.slice(6, 8)}-${date.slice(4, 6)}-${date.slice(0, 4)}` : ""}
        </div>
        <h1 className="dossier-title">{data?.dossier?.headline || title}</h1>

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

            <div className={`panel panel-kred kred-${d.kredibilitas}`}>
              <div className="panel-title">
                Validasi Kredibilitas —{" "}
                {(KRED[d.kredibilitas] || KRED.perlu_verifikasi).label}
              </div>
              <div className="summary">
                {d.verifikasi || "Belum ada dasar verifikasi yang cukup."}
              </div>
            </div>

            {d.kronologiFakta && (
              <div className="panel">
                <div className="panel-title">🕵️ Kronologi &amp; Fakta (5W+1H)</div>
                <div className="summary prose">{d.kronologiFakta}</div>
              </div>
            )}

            {d.lokasi.length > 0 && (
              <div className="panel">
                <div className="panel-title">📍 Lokasi Terkait</div>
                <div className="loc-list">
                  {d.lokasi.map((l, i) => (
                    <a
                      key={i}
                      className="loc-chip"
                      href={gmaps(l.lat, l.lon)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      📍 {l.nama}{" "}
                      <span className="muted">
                        ({l.lat.toFixed(5)}, {l.lon.toFixed(5)})
                      </span>{" "}
                      ↗
                    </a>
                  ))}
                </div>
                <iframe
                  className="loc-map"
                  title="peta lokasi"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  src={gmapsEmbed(d.lokasi[0].lat, d.lokasi[0].lon)}
                />
              </div>
            )}

            {d.analisa && (
              <div className="panel">
                <div className="panel-title">🧠 Analisa (Penilaian · Prakiraan · Solusi)</div>
                <div className="summary prose">{d.analisa}</div>
              </div>
            )}

            {d.dampak && (
              <div className="panel">
                <div className="panel-title">💥 Dampak (Pemerintahan &amp; Indonesia)</div>
                <div className="summary prose">{d.dampak}</div>
              </div>
            )}

            {d.upaya && (
              <div className="panel">
                <div className="panel-title">🛠️ Upaya (Telah / Bisa Dilakukan)</div>
                <div className="summary prose">{d.upaya}</div>
              </div>
            )}

            {d.saranTindakan.length > 0 && (
              <div className="panel panel-rec">
                <div className="panel-title">✅ Saran Tindakan</div>
                <ul className="bullets">
                  {d.saranTindakan.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </div>
            )}

            {d.sumberTerkait.length > 0 && (
              <div className="panel">
                <div className="panel-title">🔗 Berita Terkait (OSINT)</div>
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
