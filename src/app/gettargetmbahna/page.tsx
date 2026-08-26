"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ThemeToggle from "../theme-toggle";
import { makeDetailSlug, todayYYYYMMDD } from "@/lib/slug";

type Sent = "positive" | "negative" | "neutral";
type AccountType =
  | "resmi"
  | "terverifikasi"
  | "media"
  | "publik"
  | "anonim"
  | "palsu";

type SocialPost = {
  platform: string;
  account: string;
  accountUrl: string;
  url: string;
  published: string;
  content: string;
  summary: string;
  sentiment: Sent;
  sentiment_score: number;
  engagement: number;
  stance: "pro" | "kontra" | "netral";
  flag: string;
  accountType: AccountType;
  verified: boolean;
  byTarget: boolean;
  postType: string;
  replyTo: string;
  movement: string;
};

type TargetResult = {
  name: string;
  days: number;
  generatedAt: number;
  cached: boolean;
  profile: {
    name: string;
    aka: string[];
    role: string;
    org: string;
    domisili: string;
    bio: string;
    photo: string;
    photoSource: string;
    accounts: {
      platform: string;
      handle: string;
      url: string;
      verified: boolean;
      followers: string;
      status: "aktif" | "nonaktif" | "tidak_diketahui";
      lastPost: string;
    }[];
  };
  issues: { topic: string; summary: string; heat: number; sentiment: Sent }[];
  movements: {
    jenis: string;
    topic: string;
    summary: string;
    tanggal: string;
    lokasi: string;
    penggerak: string;
    peranTarget: string;
    skala: string;
    status: string;
    urls: string[];
  }[];
  impersonators: {
    platform: string;
    handle: string;
    url: string;
    reason: string;
  }[];
  posts: SocialPost[];
  error?: string;
};

type Target = { name: string; note: string; addedAt: number };

const PLATFORMS = ["threads", "instagram", "x", "facebook"];
const PLAT_ICON: Record<string, string> = {
  threads: "@",
  instagram: "IG",
  x: "X",
  facebook: "FB",
  web: "web",
};
const TRUSTED: AccountType[] = ["resmi", "terverifikasi", "media"];
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

function TargetView() {
  const router = useRouter();
  const params = useSearchParams();
  const nameParam = params.get("name") || "";

  const [targets, setTargets] = useState<Target[]>([]);
  const [box, setBox] = useState(nameParam);
  const [bulk, setBulk] = useState("");
  const [showBulk, setShowBulk] = useState(false);
  const [days, setDays] = useState(14);
  const [data, setData] = useState<TargetResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [photoErr, setPhotoErr] = useState(false); // foto gagal dimuat -> inisial

  // Filter tampilan hasil.
  const [fPlat, setFPlat] = useState<string>("all");
  const [fType, setFType] = useState<string>("all"); // all | post | reply | target
  const [onlyTrusted, setOnlyTrusted] = useState(true);

  async function loadTargets() {
    try {
      const res = await fetch("/api/targets");
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const json = await res.json();
      setTargets(Array.isArray(json.targets) ? json.targets : []);
    } catch {
      /* abaikan */
    }
  }

  async function addTarget(name: string) {
    const n = name.trim();
    if (!n) return;
    const res = await fetch("/api/targets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: n }),
    });
    const json = await res.json();
    if (res.ok) setTargets(json.targets || []);
  }

  async function addBulk() {
    const names = bulk.trim();
    if (!names) return;
    const res = await fetch("/api/targets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ names }),
    });
    const json = await res.json();
    if (res.ok) {
      setTargets(json.targets || []);
      setBulk("");
      setShowBulk(false);
    }
  }

  async function delTarget(name: string) {
    const res = await fetch(`/api/targets?name=${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
    const json = await res.json();
    if (res.ok) setTargets(json.targets || []);
  }

  async function crawl(name: string, fresh = false, d = days) {
    const n = name.trim();
    if (!n) return;
    setLoading(true);
    setError(null);
    setData(null);
    setElapsed(0);
    setPhotoErr(false);
    const started = Date.now();
    const timer = setInterval(
      () => setElapsed(Math.round((Date.now() - started) / 1000)),
      1000
    );
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 200000);
    try {
      const res = await fetch(
        `/api/target?name=${encodeURIComponent(n)}&days=${d}${fresh ? "&fresh=1" : ""}`,
        { signal: ctrl.signal }
      );
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const json = (await res.json()) as TargetResult;
      if (!res.ok) throw new Error(json.error || "gagal menyisir");
      setData(json);
    } catch (e: any) {
      setError(
        e?.name === "AbortError"
          ? "Terlalu lama. Coba lagi atau pilih model lebih cepat di ⚙ Setup."
          : e?.message || "gagal menyisir"
      );
    } finally {
      clearInterval(timer);
      clearTimeout(to);
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTargets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setBox(nameParam);
    if (nameParam.trim()) crawl(nameParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nameParam]);

  function openTarget(name: string) {
    router.push(`/gettargetmbahna?name=${encodeURIComponent(name)}`);
  }

  function openDossier(p: SocialPost) {
    const subject = p.summary || p.content || data?.name || "post";
    const slug = makeDetailSlug(subject.slice(0, 60), todayYYYYMMDD());
    const q = new URLSearchParams();
    if (p.url) q.set("u", p.url);
    q.set("t", `${data?.name || ""} — ${subject}`.slice(0, 160));
    router.push(`/detail/${slug}?${q.toString()}`);
  }

  const shown = useMemo(() => {
    if (!data) return [];
    return data.posts.filter((p) => {
      if (onlyTrusted && !TRUSTED.includes(p.accountType)) return false;
      if (fPlat !== "all" && p.platform !== fPlat) return false;
      if (fType === "target" && !p.byTarget) return false;
      if (fType === "reply" && !["reply", "quote", "comment"].includes(p.postType))
        return false;
      if (fType === "post" && !["post", "repost", "reels"].includes(p.postType))
        return false;
      return true;
    });
  }, [data, fPlat, fType, onlyTrusted]);

  const stats = useMemo(() => {
    if (!data) return null;
    const sent = { positive: 0, negative: 0, neutral: 0 };
    const plat: Record<string, number> = {};
    let flagged = 0;
    let replies = 0;
    let byTarget = 0;
    let trusted = 0;
    for (const p of data.posts) {
      sent[p.sentiment]++;
      plat[p.platform] = (plat[p.platform] || 0) + 1;
      if (p.flag !== "none") flagged++;
      if (["reply", "quote", "comment"].includes(p.postType)) replies++;
      if (p.byTarget) byTarget++;
      if (TRUSTED.includes(p.accountType)) trusted++;
    }
    const dominant = (Object.entries(sent).sort((a, b) => b[1] - a[1])[0]?.[0] ||
      "neutral") as Sent;
    return { sent, plat, flagged, replies, byTarget, trusted, dominant };
  }, [data]);

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
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const n = box.trim();
            if (n) openTarget(n);
          }}
        >
          <input
            value={box}
            onChange={(e) => setBox(e.target.value)}
            placeholder="nama orang / target…"
          />
          <button type="submit">Sisir</button>
          <button
            type="button"
            className="refresh"
            title="sisir ulang (abaikan cache)"
            onClick={() => data?.name && crawl(data.name, true)}
            disabled={loading}
          >
            ↻
          </button>
        </form>
        <select
          className="days-sel"
          value={days}
          onChange={(e) => {
            const d = Number(e.target.value);
            setDays(d);
            if (data?.name) crawl(data.name, true, d);
          }}
          title="rentang waktu"
        >
          <option value={7}>7 hari</option>
          <option value={14}>14 hari</option>
          <option value={30}>30 hari</option>
        </select>
        <button
          type="button"
          className="refresh"
          title="pantau Facebook (isu & gerakan)"
          onClick={() => router.push("/facebook")}
        >
          📘
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
        <div className="section-title" style={{ marginTop: 4 }}>
          🎯 Pantau Individu — Threads · Instagram · X
        </div>
        <div className="hint" style={{ marginTop: -6, marginBottom: 14 }}>
          Fokus perorangan (tokoh publik / influencer). Sumber diutamakan akun
          <b> resmi milik orangnya</b> + akun terverifikasi/media — akun palsu/parodi
          dipisah ke daftar impersonasi.
        </div>

        {/* Daftar nama target */}
        <div className="panel" style={{ marginBottom: 18 }}>
          <div className="panel-title">Daftar Target</div>
          {targets.length === 0 && (
            <div className="hint" style={{ marginTop: 0 }}>
              Belum ada nama. Tambahkan di bawah (bisa tempel banyak nama sekaligus).
            </div>
          )}
          <div className="tchips">
            {targets.map((t) => (
              <span
                key={t.name}
                className={`tchip ${
                  data?.name?.toLowerCase() === t.name.toLowerCase() ? "active" : ""
                }`}
              >
                <span className="tchip-name" onClick={() => openTarget(t.name)}>
                  {t.name}
                </span>
                <span
                  className="tchip-del"
                  title="hapus"
                  onClick={() => delTarget(t.name)}
                >
                  ✕
                </span>
              </span>
            ))}
          </div>

          <form
            className="mini-search"
            style={{ marginTop: 12 }}
            onSubmit={(e) => {
              e.preventDefault();
              const n = box.trim();
              if (!n) return;
              addTarget(n);
              openTarget(n);
            }}
          >
            <input
              value={box}
              onChange={(e) => setBox(e.target.value)}
              placeholder="tambah nama target…"
            />
            <button type="submit">+ Tambah</button>
            <button
              type="button"
              className="refresh"
              onClick={() => setShowBulk((v) => !v)}
              title="tempel banyak nama"
            >
              ⋮
            </button>
          </form>

          {showBulk && (
            <div style={{ marginTop: 10 }}>
              <textarea
                className="bulk-area"
                value={bulk}
                onChange={(e) => setBulk(e.target.value)}
                placeholder={"Tempel daftar nama, satu per baris atau pisah koma…"}
                rows={5}
              />
              <button className="save-btn" style={{ marginTop: 8 }} onClick={addBulk}>
                Simpan daftar
              </button>
            </div>
          )}
        </div>

        {loading && (
          <div className="state">
            <div className="spinner" />
            Menyisir Threads, Instagram &amp; X untuk "{box}"… <b>{elapsed}s</b>
          </div>
        )}

        {error && <div className="error">⚠ {error}</div>}

        {data && !loading && (
          <>
            <div className="meta">
              {data.posts.length} postingan · rentang {data.days} hari
              {data.cached && <span className="badge-cache">dari cache</span>}
              {data.generatedAt ? ` · ${fmtTime(data.generatedAt)}` : ""}
            </div>

            {/* Profil orang */}
            <div className="panel profile-card">
              <div className="profile-head">
                {data.profile.photo && !photoErr ? (
                  <img
                    className="avatar-img"
                    // Lewat proxy server: CDN sosmed sering menolak hotlink browser.
                    src={`/api/photo?u=${encodeURIComponent(data.profile.photo)}`}
                    alt={data.profile.name}
                    referrerPolicy="no-referrer"
                    onError={() => setPhotoErr(true)}
                  />
                ) : (
                  <div className="avatar">{(data.profile.name || "?").charAt(0)}</div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="profile-name">{data.profile.name}</div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {[data.profile.role, data.profile.org, data.profile.domisili]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </div>
                  {data.profile.aka.length > 0 && (
                    <div className="chips" style={{ marginTop: 8 }}>
                      {data.profile.aka.map((a, i) => (
                        <span className="chip" key={i}>
                          aka: {a}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {data.profile.bio && (
                <div className="summary" style={{ marginTop: 12 }}>
                  {data.profile.bio}
                </div>
              )}
              {data.profile.photo && !photoErr && data.profile.photoSource && (
                <div className="hint" style={{ marginTop: 6 }}>
                  📷 foto: {data.profile.photoSource}
                </div>
              )}

              {data.profile.accounts.length > 0 && (
                <div className="acct-table-wrap">
                  <table className="acct-table">
                    <thead>
                      <tr>
                        <th>Platform</th>
                        <th>Username / URL</th>
                        <th>Status</th>
                        <th>Followers</th>
                        <th>Aktivitas terakhir</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.profile.accounts.map((a, i) => (
                        <tr key={i}>
                          <td>
                            <span className="plat-badge">
                              {PLAT_ICON[a.platform] || a.platform}
                            </span>
                          </td>
                          <td>
                            <a href={a.url || "#"} target="_blank" rel="noreferrer">
                              {a.handle || a.url}
                            </a>
                            {a.verified && <span className="ver"> ✔</span>}
                          </td>
                          <td>
                            <span className={`acct-status ${a.status}`}>
                              {a.status === "aktif"
                                ? "aktif"
                                : a.status === "nonaktif"
                                ? "non-aktif"
                                : "tidak diketahui"}
                            </span>
                          </td>
                          <td className="mono">{a.followers || "—"}</td>
                          <td className="mono">{a.lastPost || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Akun palsu / impersonasi */}
            {data.impersonators.length > 0 && (
              <>
                <div className="section-title alert-title">
                  ⚠ Akun Mengatasnamakan Target (bukan sumber sah)
                </div>
                <div className="panel">
                  {data.impersonators.map((im, i) => (
                    <div className="imp-row" key={i}>
                      <span className="plat-badge">
                        {PLAT_ICON[im.platform] || im.platform}
                      </span>
                      <a href={im.url || "#"} target="_blank" rel="noreferrer">
                        {im.handle}
                      </a>
                      <span className="muted">{im.reason}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Statistik */}
            {stats && (
              <div className="stat-cards">
                <div className="stat">
                  <div className="stat-num">{data.posts.length}</div>
                  <div className="stat-lbl">Postingan terpantau</div>
                </div>
                <div className="stat">
                  <div className="stat-num">{stats.byTarget}</div>
                  <div className="stat-lbl">Dari akun resmi target</div>
                </div>
                <div className="stat">
                  <div className="stat-num">{stats.replies}</div>
                  <div className="stat-lbl">Interaksi (reply/quote)</div>
                </div>
                <div className="stat">
                  <div
                    className="stat-num"
                    style={{ color: SENT_COLORS[stats.dominant] }}
                  >
                    {stats.dominant}
                  </div>
                  <div className="stat-lbl">Sentimen dominan</div>
                </div>
              </div>
            )}

            {/* Gerakan / mobilisasi */}
            {data.movements.length > 0 && (
              <>
                <div className="section-title">📣 Gerakan &amp; Mobilisasi Terkait</div>
                {data.movements.map((m, i) => (
                  <article className="alert-card" key={i}>
                    <div className="head">
                      <span className="threat-badge">{m.jenis.replace(/_/g, " ")}</span>
                      {m.status && <span className="platform">{m.status}</span>}
                      {m.peranTarget && (
                        <span className="platform">peran: {m.peranTarget.replace(/_/g, " ")}</span>
                      )}
                    </div>
                    <div className="title">{m.topic}</div>
                    {m.summary && <div className="summary">{m.summary}</div>}
                    <div className="move-meta">
                      {m.tanggal && <span>🗓 {m.tanggal}</span>}
                      {m.lokasi && <span>📍 {m.lokasi}</span>}
                      {m.penggerak && <span>👥 {m.penggerak}</span>}
                      {m.skala && <span>📊 {m.skala}</span>}
                    </div>
                    {m.urls.length > 0 && (
                      <div className="sources">
                        {m.urls.map((u, j) => (
                          <a key={j} href={u} target="_blank" rel="noreferrer">
                            sumber {j + 1} ↗
                          </a>
                        ))}
                      </div>
                    )}
                  </article>
                ))}
              </>
            )}

            {/* Isu utama */}
            {data.issues.length > 0 && (
              <>
                <div className="section-title">🗣 Isu yang Menyeret Namanya</div>
                {data.issues.map((it, i) => (
                  <article className="trend" key={i}>
                    <div className="rank">#{i + 1}</div>
                    <div className="trend-body">
                      <div className="head">
                        <span className={`sent ${it.sentiment}`}>{it.sentiment}</span>
                        <span className="heat-num">🔥 {it.heat}</span>
                      </div>
                      <div className="title">{it.topic}</div>
                      <div className="heatbar">
                        <div className="heatbar-fill" style={{ width: `${it.heat}%` }} />
                      </div>
                      {it.summary && <div className="summary">{it.summary}</div>}
                    </div>
                  </article>
                ))}
              </>
            )}

            {/* Postingan */}
            <div className="section-title">📲 Postingan &amp; Interaksi</div>
            <div className="filter-row">
              <div className="chips">
                <span
                  className={`fchip ${fPlat === "all" ? "active" : ""}`}
                  onClick={() => setFPlat("all")}
                >
                  semua platform
                </span>
                {PLATFORMS.map((p) => (
                  <span
                    key={p}
                    className={`fchip ${fPlat === p ? "active" : ""}`}
                    onClick={() => setFPlat(p)}
                  >
                    {p} ({stats?.plat[p] || 0})
                  </span>
                ))}
              </div>
              <div className="chips">
                {[
                  ["all", "semua"],
                  ["post", "post"],
                  ["reply", "reply/quote"],
                  ["target", "dari target"],
                ].map(([v, l]) => (
                  <span
                    key={v}
                    className={`fchip ${fType === v ? "active" : ""}`}
                    onClick={() => setFType(v)}
                  >
                    {l}
                  </span>
                ))}
              </div>
              <label className="check" style={{ fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={onlyTrusted}
                  onChange={(e) => setOnlyTrusted(e.target.checked)}
                />
                hanya akun asli/terverifikasi ({stats?.trusted || 0})
              </label>
            </div>

            {onlyTrusted &&
              data.posts.some(
                (p) => p.platform === "facebook" && !TRUSTED.includes(p.accountType)
              ) && (
                <div className="hint" style={{ marginTop: -6, marginBottom: 12 }}>
                  Post Facebook dari worker berstatus akun <b>publik</b> (kepemilikan
                  belum diverifikasi), jadi tersembunyi oleh filter "hanya akun
                  asli/terverifikasi". Matikan centang itu untuk melihatnya.
                </div>
              )}

            {stats && PLATFORMS.some((p) => !stats.plat[p]) && (
              <div className="hint" style={{ marginTop: -6, marginBottom: 12 }}>
                Sebaran: {PLATFORMS.map((p) => `${p} ${stats.plat[p] || 0}`).join(" · ")}.
                Platform bernilai 0 = tidak ada permalink post publik yang ketemu di
                rentang {data.days} hari ini (post Instagram/Threads memang lebih jarang
                terindeks daripada X). Coba perpanjang rentang atau tekan ↻.
              </div>
            )}

            {shown.length === 0 && (
              <div className="state">
                Tidak ada postingan sesuai filter. Longgarkan filter atau tekan ↻.
              </div>
            )}

            {shown.map((p, i) => (
              <article className="card clickable" key={i} onClick={() => openDossier(p)}>
                <div className="head">
                  <span className="plat-badge">{PLAT_ICON[p.platform] || p.platform}</span>
                  <span className={`ptype ${p.postType}`}>{p.postType}</span>
                  {p.byTarget && <span className="own-badge">akun target</span>}
                  {p.verified && !p.byTarget && <span className="ver">✔</span>}
                  {p.flag !== "none" && (
                    <span className="threat-badge sm">⚠ {p.flag.replace(/_/g, " ")}</span>
                  )}
                  {p.movement !== "none" && (
                    <span className="move-badge">📣 {p.movement.replace(/_/g, " ")}</span>
                  )}
                </div>
                <div className="src">
                  {p.account || "—"}
                  {p.replyTo ? ` ↩ ${p.replyTo}` : ""}
                  {p.published ? ` · ${p.published}` : ""}
                  {` · ${p.accountType}`}
                </div>
                {p.content && <div className="snippet">“{p.content}”</div>}
                {p.summary && <div className="summary">{p.summary}</div>}
                <div className="foot">
                  <span className={`sent ${p.sentiment}`}>
                    {p.sentiment} ({p.sentiment_score.toFixed(2)})
                  </span>
                  <span className={`stance ${p.stance}`}>{p.stance}</span>
                  {p.engagement > 0 && <span className="heat-num">🔥 {p.engagement}</span>}
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
          </>
        )}
      </div>
    </>
  );
}

export default function TargetPage() {
  return (
    <Suspense fallback={<div className="state">memuat…</div>}>
      <TargetView />
    </Suspense>
  );
}
