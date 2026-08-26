"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ThemeToggle from "../theme-toggle";
import { makeDetailSlug, todayYYYYMMDD } from "@/lib/slug";

// Halaman pemantauan Facebook — berbasis ISU (demo, aksi massa, petisi),
// bukan per orang. Datanya dari worker Chromium (worker/fb-worker.mjs) yang
// mengirim lewat /api/fb/ingest. Halaman ini tidak menyisir apa pun sendiri.

type FbPost = {
  platform: string;
  account: string;
  accountUrl: string;
  url: string;
  published: string;
  content: string;
  summary: string;
  engagement: number;
  movement: string;
};

type Entry = { query: string; collectedAt: number; posts: FbPost[] };

type Feed = {
  entries: Entry[];
  stats: {
    queries: number;
    posts: number;
    withMovement: number;
    byMovement: Record<string, number>;
    lastCollectedAt: number;
  };
  workerConfigured: boolean;
  error?: string;
};

const MOVE_LABEL: Record<string, string> = {
  demo: "demo",
  aksi_massa: "aksi massa",
  seruan_massa: "seruan massa",
  petisi: "petisi",
  boikot: "boikot",
  mogok: "mogok",
  penggalangan: "penggalangan",
  kampanye_politik: "kampanye politik",
};

function fmtTime(ms: number) {
  try {
    return new Date(ms).toLocaleString("id-ID");
  } catch {
    return "";
  }
}

export default function FacebookPage() {
  const router = useRouter();
  const [feed, setFeed] = useState<Feed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [fQuery, setFQuery] = useState("all");
  const [fMove, setFMove] = useState("all"); // all | gerakan | <jenis>
  const [cari, setCari] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/fb/feed");
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const json = (await res.json()) as Feed;
      if (!res.ok) throw new Error(json.error || "gagal memuat");
      setFeed(json);
    } catch (e: any) {
      setError(e?.message || "gagal memuat");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // Worker mengirim di latar belakang — segarkan tiap 5 menit.
    const iv = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openDossier(p: FbPost, query: string) {
    const subject = (p.content || query).slice(0, 60);
    const slug = makeDetailSlug(subject, todayYYYYMMDD());
    const q = new URLSearchParams();
    if (p.url) q.set("u", p.url);
    q.set("t", `${query} — ${subject}`.slice(0, 160));
    router.push(`/detail/${slug}?${q.toString()}`);
  }

  // Post digabung lintas kueri, ditandai kueri asalnya.
  const rows = useMemo(() => {
    if (!feed) return [];
    const key = cari.trim().toLowerCase();
    const out: (FbPost & { query: string; collectedAt: number })[] = [];
    for (const e of feed.entries) {
      if (fQuery !== "all" && e.query !== fQuery) continue;
      for (const p of e.posts) {
        if (fMove === "gerakan" && p.movement === "none") continue;
        if (fMove !== "all" && fMove !== "gerakan" && p.movement !== fMove) continue;
        if (
          key &&
          !`${p.content} ${p.account} ${e.query}`.toLowerCase().includes(key)
        )
          continue;
        out.push({ ...p, query: e.query, collectedAt: e.collectedAt });
      }
    }
    // Yang bermuatan gerakan naik, lalu yang paling ramai.
    return out.sort((a, b) => {
      const ga = a.movement === "none" ? 0 : 1;
      const gb = b.movement === "none" ? 0 : 1;
      if (ga !== gb) return gb - ga;
      return b.engagement - a.engagement;
    });
  }, [feed, fQuery, fMove, cari]);

  const moveKinds = useMemo(
    () => Object.entries(feed?.stats.byMovement || {}).sort((a, b) => b[1] - a[1]),
    [feed]
  );

  return (
    <>
      <header className="topbar">
        <div
          className="logo"
          style={{ cursor: "pointer" }}
          onClick={() => router.push("/")}
        >
          mbah<span className="dot">na</span>
        </div>
        <div style={{ flex: 1, fontWeight: 600 }}>📘 Pantau Facebook — Isu &amp; Gerakan</div>
        <button
          type="button"
          className="refresh"
          title="muat ulang"
          onClick={load}
          disabled={loading}
        >
          ↻
        </button>
        <button
          type="button"
          className="refresh"
          title="pantau individu"
          onClick={() => router.push("/gettargetmbahna")}
        >
          🎯
        </button>
        <button
          type="button"
          className="refresh"
          title="dashboard"
          onClick={() => router.push("/")}
        >
          🔥
        </button>
        <ThemeToggle />
      </header>

      <div className="wrap" style={{ maxWidth: 940 }}>
        <div className="hint" style={{ marginTop: 0, marginBottom: 16 }}>
          Halaman ini menampilkan hasil <b>worker Chromium</b> yang menyisir Page &amp;
          grup publik Facebook di komputer/VPS-mu. Website tidak menyisir sendiri —
          kalau kosong, berarti worker belum jalan.
        </div>

        {loading && !feed && (
          <div className="state">
            <div className="spinner" />
            memuat kiriman worker…
          </div>
        )}

        {error && <div className="error">⚠ {error}</div>}

        {feed && (
          <>
            <div className="stat-cards">
              <div className="stat">
                <div className="stat-num">{feed.stats.posts}</div>
                <div className="stat-lbl">Post terkumpul</div>
              </div>
              <div className="stat">
                <div className="stat-num" style={{ color: "#f0a020" }}>
                  {feed.stats.withMovement}
                </div>
                <div className="stat-lbl">📣 Bermuatan gerakan</div>
              </div>
              <div className="stat">
                <div className="stat-num">{feed.stats.queries}</div>
                <div className="stat-lbl">Kueri dipantau</div>
              </div>
              <div className="stat">
                <div className="stat-num" style={{ fontSize: 14 }}>
                  {feed.stats.lastCollectedAt
                    ? fmtTime(feed.stats.lastCollectedAt)
                    : "belum ada"}
                </div>
                <div className="stat-lbl">Kiriman terakhir</div>
              </div>
            </div>

            {feed.stats.posts === 0 && (
              <div className="panel">
                <div className="panel-title">Worker belum mengirim apa pun</div>
                {!feed.workerConfigured && (
                  <div className="hint" style={{ marginTop: 0 }}>
                    ⚠ <code>FB_WORKER_TOKEN</code> belum di-set di server, jadi
                    endpoint ingest tertutup.
                  </div>
                )}
                <div className="hint">
                  Jalankan di komputer/VPS:
                  <pre className="cmd">{`cd worker
npm install
npx playwright install chromium
npm run login      # login manual sekali
npm run crawl      # sisir sekali
npm run watch      # sisir terus tiap jam`}</pre>
                  Pengaturannya di <code>worker/.env</code> — <code>APP_URL</code>,{" "}
                  <code>FB_WORKER_TOKEN</code>, <code>FB_KEYWORDS</code>.
                </div>
              </div>
            )}

            {feed.stats.posts > 0 && (
              <>
                <div className="filter-row">
                  <div className="chips">
                    <span
                      className={`fchip ${fMove === "all" ? "active" : ""}`}
                      onClick={() => setFMove("all")}
                    >
                      semua post
                    </span>
                    <span
                      className={`fchip ${fMove === "gerakan" ? "active" : ""}`}
                      onClick={() => setFMove("gerakan")}
                    >
                      📣 ada gerakan ({feed.stats.withMovement})
                    </span>
                    {moveKinds.map(([kind, n]) => (
                      <span
                        key={kind}
                        className={`fchip ${fMove === kind ? "active" : ""}`}
                        onClick={() => setFMove(kind)}
                      >
                        {MOVE_LABEL[kind] || kind} ({n})
                      </span>
                    ))}
                  </div>
                </div>

                <div className="filter-row">
                  <select
                    className="days-sel"
                    value={fQuery}
                    onChange={(e) => setFQuery(e.target.value)}
                    title="kueri worker"
                  >
                    <option value="all">semua kueri ({feed.entries.length})</option>
                    {feed.entries.map((e) => (
                      <option key={e.query} value={e.query}>
                        {e.query} ({e.posts.length})
                      </option>
                    ))}
                  </select>
                  <input
                    className="fb-search"
                    value={cari}
                    onChange={(e) => setCari(e.target.value)}
                    placeholder="cari di isi post / akun…"
                  />
                </div>

                <div className="meta">{rows.length} post ditampilkan</div>

                {rows.length === 0 && (
                  <div className="state">
                    Tidak ada post sesuai filter. Longgarkan filternya.
                  </div>
                )}

                {rows.map((p, i) => (
                  <article
                    className="card clickable"
                    key={i}
                    onClick={() => openDossier(p, p.query)}
                  >
                    <div className="head">
                      <span className="plat-badge">FB</span>
                      {p.movement !== "none" && (
                        <span className="move-badge">
                          📣 {MOVE_LABEL[p.movement] || p.movement}
                        </span>
                      )}
                      <span className="platform">{p.query}</span>
                      {p.engagement > 0 && (
                        <span className="heat-num">🔥 {p.engagement}</span>
                      )}
                    </div>
                    <div className="src">
                      {p.accountUrl ? (
                        <a
                          href={p.accountUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {p.account || "—"}
                        </a>
                      ) : (
                        p.account || "—"
                      )}
                      {p.published ? ` · ${p.published}` : ""}
                      {p.collectedAt ? ` · disisir ${fmtTime(p.collectedAt)}` : ""}
                    </div>
                    {p.content && <div className="snippet">“{p.content}”</div>}
                    <div className="foot">
                      <span className="dossier-link">📑 dossier →</span>
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        buka post ↗
                      </a>
                    </div>
                  </article>
                ))}

                <div className="hint" style={{ marginTop: 18 }}>
                  Catatan: post Facebook diambil apa adanya — <b>belum dianalisa
                  model</b>. Label gerakan berasal dari pencocokan kata kunci
                  (demo, unjuk rasa, aksi massa, petisi, boikot, mogok, galang dana,
                  kampanye), jadi bisa meleset. Klik 📑 dossier untuk analisa penuh.
                </div>
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
