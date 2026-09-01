"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Shell from "../shell";
import { makeDetailSlug, todayYYYYMMDD } from "@/lib/slug";

// Halaman pemantauan Facebook — berbasis ISU (demo, aksi massa, petisi),
// bukan per orang. Datanya dari worker Chromium (worker/fb-worker.mjs) yang
// mengirim lewat /api/fb/ingest. Halaman ini tidak menyisir apa pun sendiri.

type FbComment = {
  author: string;
  text: string;
  likes: number;
  url: string;
  movement: string;
  triggers: boolean; // banyak like atau menyerukan gerakan
};

type FbPost = {
  account: string;
  accountUrl: string;
  url: string;
  published: string;
  publishedAt: number;
  shotId: string;
  title: string;
  content: string;
  engagement: number;
  engagementText: string;
  movement: string;
  comments: FbComment[];
  hotComments: number;
};

type Entry = { query: string; collectedAt: number; posts: FbPost[] };

type Feed = {
  entries: Entry[];
  stats: {
    queries: number;
    posts: number;
    withMovement: number;
    comments: number;
    hotComments: number;
    byMovement: Record<string, number>;
    lastCollectedAt: number;
  };
  workerConfigured: boolean;
  storage: "redis" | "file";
  maxAgeDays: number;
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
    const subject = (p.title || p.content || query).slice(0, 60);
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
        const haystack = `${p.title} ${p.content} ${p.account} ${e.query} ${p.comments
          .map((c) => `${c.author} ${c.text}`)
          .join(" ")}`.toLowerCase();
        if (key && !haystack.includes(key)) continue;
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
    <Shell judul="Crawl Social Media" aksi={
        <button type="button" className="refresh ikon-btn" title="muat ulang" onClick={load} disabled={loading}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 11a8 8 0 1 0-2.3 5.7" />
            <path d="M20 5v6h-6" />
          </svg>
        </button>
      }>

      <div className="wrap" style={{ maxWidth: 940 }}>
        <div className="hint" style={{ marginTop: 0, marginBottom: 16 }}>
          Halaman ini menampilkan hasil <b>worker Chromium</b> yang menyisir Page &amp;
          grup publik Facebook di komputer/VPS-mu. Website tidak menyisir sendiri —
          kalau kosong, berarti worker belum jalan. Hanya postingan{" "}
          <b>maksimal {feed?.maxAgeDays ?? 3} hari terakhir</b> yang ditampilkan.
        </div>

        {loading && !feed && (
          <div className="state">
            <div className="spinner" />
            memuat kiriman worker…
          </div>
        )}

        {error && <div className="error">{error}</div>}

        {feed && feed.storage === "file" && (
          <div className="error">
            Penyimpanan masih berkas lokal. Kalau situs ini jalan di Vercel, data
            kiriman worker <b>bisa hilang sewaktu-waktu</b> (filesystem serverless
            ephemeral). Set <code>UPSTASH_REDIS_REST_URL</code> +{" "}
            <code>UPSTASH_REDIS_REST_TOKEN</code> di Environment Variables lalu
            Redeploy.
          </div>
        )}

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
                <div className="stat-lbl">Bermuatan gerakan</div>
              </div>
              <div className="stat">
                <div className="stat-num">{feed.stats.comments}</div>
                <div className="stat-lbl">
                  Komentar terkumpul
                  {feed.stats.hotComments > 0 && (
                    <> · <b>{feed.stats.hotComments}</b> memicu isu</>
                  )}
                </div>
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
                    <code>FB_WORKER_TOKEN</code> belum di-set di server, jadi
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
                      ada gerakan ({feed.stats.withMovement})
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
                  <article className="card fb-card" key={i}>
                    <div className="head">
                      <span className="plat-badge">FB</span>
                      {p.movement !== "none" && (
                        <span className="move-badge">
                          {MOVE_LABEL[p.movement] || p.movement}
                        </span>
                      )}
                      <span className="platform">{p.query}</span>
                      {p.engagement > 0 && (
                        <span className="heat-num">{p.engagement}</span>
                      )}
                    </div>

                    {/* Judul: Facebook tak punya judul, ini kalimat pertama post */}
                    <div className="title fb-title" onClick={() => openDossier(p, p.query)}>
                      {p.title || "(tanpa teks)"}
                    </div>

                    <div className="src">
                      {p.accountUrl ? (
                        <a href={p.accountUrl} target="_blank" rel="noreferrer">
                          {p.account || "—"}
                        </a>
                      ) : (
                        p.account || "—"
                      )}
                      {p.published ? ` · ${p.published}` : ""}
                      {p.publishedAt
                        ? ` · ${new Date(p.publishedAt).toLocaleDateString("id-ID")}`
                        : " · waktu tidak terbaca"}
                      {p.collectedAt ? ` · disisir ${fmtTime(p.collectedAt)}` : ""}
                    </div>

                    <div className="fb-url">
                      <a href={p.url} target="_blank" rel="noreferrer">
                        {p.url}
                      </a>
                    </div>

                    {p.shotId && (
                      <img
                        className="fb-shot"
                        src={`/api/fb/shot?id=${encodeURIComponent(p.shotId)}`}
                        alt="tangkapan layar postingan"
                        loading="lazy"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                    )}

                    {p.content && <div className="fb-body">{p.content}</div>}
                    {p.engagementText && (
                      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                        {p.engagementText}
                      </div>
                    )}

                    {p.comments.length > 0 && (
                      <div className="fb-comments">
                        <div className="fb-comments-head">
                          Komentar teratas ({p.comments.length})
                          {p.hotComments > 0 && (
                            <span className="move-badge" style={{ marginLeft: 8 }}>
                              {p.hotComments} memicu isu
                            </span>
                          )}
                        </div>
                        {p.comments.map((c, j) => (
                          <div
                            className={`fb-comment ${c.triggers ? "hot" : ""}`}
                            key={j}
                          >
                            <div className="fb-comment-top">
                              <b>{c.author || "—"}</b>
                              <span className="fb-likes">suka {c.likes}</span>
                              {c.movement !== "none" && (
                                <span className="move-badge">
                                  {MOVE_LABEL[c.movement] || c.movement}
                                </span>
                              )}
                              {c.url && (
                                <a href={c.url} target="_blank" rel="noreferrer">
                                  
                                </a>
                              )}
                            </div>
                            <div className="fb-comment-text">{c.text}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="foot">
                      <span
                        className="dossier-link"
                        style={{ cursor: "pointer" }}
                        onClick={() => openDossier(p, p.query)}
                      >
                        buka dossier
                      </span>
                      <a href={p.url} target="_blank" rel="noreferrer">
                        buka post
                      </a>
                    </div>
                  </article>
                ))}

                <div className="hint" style={{ marginTop: 18 }}>
                  Catatan: post Facebook diambil apa adanya — <b>belum dianalisa
                  model</b>. Label gerakan berasal dari pencocokan kata kunci
                  (demo, unjuk rasa, aksi massa, petisi, boikot, mogok, galang dana,
                  kampanye), jadi bisa meleset. Klik dossier untuk analisa penuh.
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Shell>
  );
}
