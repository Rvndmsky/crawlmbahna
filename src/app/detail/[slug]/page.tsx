"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import Shell from "../../shell";
import { parseDetailSlug, titleCase } from "@/lib/slug";

type RelatedSource = { title: string; url: string; source: string; published: string };
type Lokasi = { nama: string; lat: number; lon: number };
type Actor = { nama: string; peran: string; afiliasi: string };
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
  aktor: Actor[];
  organisasi: string[];
  penilaian: string;
  prakiraan: string;
  solusi: string;
  dampak: string;
  reaksiPublik: string;
  upayaTelah: string;
  upayaBisa: string;
  implikasi: string[];
  rekomendasiPantau: string[];
  saranTindakan: string[];
  lokasi: Lokasi[];
  sumberTerkait: RelatedSource[];
  tanggalBerita: string;
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
// Pakai NAMA tempat (Google yang geocode) — lebih akurat daripada koordinat model.
const gmaps = (q: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
const gmapsEmbed = (q: string) =>
  `https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=15&output=embed`;
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
    <Shell judul="Dossier Intel">

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

            {(d.aktor.length > 0 || d.organisasi.length > 0) && (
              <div className="dossier-grid">
                <div className="panel">
                  <div className="panel-title">👤 Aktor / Tokoh</div>
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
                  <div className="panel-title">🏛️ Organisasi / Lembaga</div>
                  <Chips items={d.organisasi} />
                </div>
              </div>
            )}

            {d.lokasi.length > 0 && (
              <div className="panel">
                <div className="panel-title">📍 Tempat Kejadian Perkara</div>
                <a
                  className="loc-chip loc-primary"
                  href={gmaps(d.lokasi[0].nama)}
                  target="_blank"
                  rel="noreferrer"
                >
                  🎯 {d.lokasi[0].nama} ↗
                </a>
                <iframe
                  className="loc-map"
                  title="peta tempat kejadian"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  src={gmapsEmbed(d.lokasi[0].nama)}
                />
              </div>
            )}

            {(d.penilaian || d.prakiraan || d.solusi) && (
              <div className="panel">
                <div className="panel-title">🧠 Analisa</div>
                {d.penilaian && (
                  <div className="labeled">
                    <b>PENILAIAN</b>
                    <div className="summary prose">{d.penilaian}</div>
                  </div>
                )}
                {d.prakiraan && (
                  <div className="labeled">
                    <b>PRAKIRAAN</b>
                    <div className="summary prose">{d.prakiraan}</div>
                  </div>
                )}
                {d.solusi && (
                  <div className="labeled">
                    <b>SOLUSI</b>
                    <div className="summary prose">{d.solusi}</div>
                  </div>
                )}
              </div>
            )}

            {d.dampak && (
              <div className="panel">
                <div className="panel-title">💥 Dampak (Pemerintahan &amp; Indonesia)</div>
                <div className="summary prose">{d.dampak}</div>
              </div>
            )}

            {d.reaksiPublik && (
              <div className="panel">
                <div className="panel-title">📣 Reaksi Publik</div>
                <div className="summary prose">{d.reaksiPublik}</div>
              </div>
            )}

            {(d.upayaTelah || d.upayaBisa) && (
              <div className="panel">
                <div className="panel-title">🛠️ Upaya</div>
                {d.upayaTelah && (
                  <div className="labeled">
                    <b>UPAYA YANG TELAH DILAKUKAN</b>
                    <div className="summary prose">{d.upayaTelah}</div>
                  </div>
                )}
                {d.upayaBisa && (
                  <div className="labeled">
                    <b>UPAYA YANG BISA DILAKUKAN</b>
                    <div className="summary prose">{d.upayaBisa}</div>
                  </div>
                )}
              </div>
            )}

            {(d.implikasi.length > 0 || d.rekomendasiPantau.length > 0) && (
              <div className="dossier-grid">
                {d.implikasi.length > 0 && (
                  <div className="panel">
                    <div className="panel-title">🔮 Implikasi</div>
                    <ul className="bullets">
                      {d.implikasi.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {d.rekomendasiPantau.length > 0 && (
                  <div className="panel">
                    <div className="panel-title">👁️ Rekomendasi Pantau</div>
                    <ul className="bullets">
                      {d.rekomendasiPantau.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  </div>
                )}
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
                {d.tanggalBerita && (
                  <div className="hint" style={{ marginTop: 0, marginBottom: 10 }}>
                    Sezaman dengan berita utama ({d.tanggalBerita})
                  </div>
                )}
                <div className="terkait-list">
                  {d.sumberTerkait.map((s, i) => (
                    <a
                      key={i}
                      className="terkait-item"
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span className="terkait-judul">{s.title || s.url}</span>
                      <span className="terkait-meta">
                        {s.source}
                        {s.published ? ` · ${s.published}` : ""}
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Shell>
  );
}

export default function DetailPage() {
  return (
    <Suspense fallback={<div className="state">memuat…</div>}>
      <Detail />
    </Suspense>
  );
}
