"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Shell from "../shell";
import bandungRaw from "./bandung-data.json";

type Cam = { id: string; name: string; embed: string; type: "iframe" | "hls"; badge?: string };
type Data = { cameras: Cam[]; total: number; page: number; pages: number };

const KOTA = [
  { id: "jakarta", label: "Jakarta" },
  { id: "bandung", label: "Bandung" },
];

const PER_PAGE = 9;
const MAX_PAGES_BANDUNG = 9;

const BANDUNG_CAMS: Cam[] = bandungRaw.map((c: any) => ({
  id: c.id, name: c.name, embed: c.stream, type: "hls" as const, badge: c.dinas,
}));

function HlsPlayer({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const video: HTMLVideoElement = el;
    let hls: any = null;

    function init() {
      const Hls = (window as any).Hls;
      if (!Hls) return;
      if (Hls.isSupported()) {
        hls = new Hls({ enableWorker: false });
        hls.loadSource(src);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = src;
        video.play().catch(() => {});
      }
    }

    if ((window as any).Hls) init();
    else {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.5.7/hls.min.js";
      s.onload = init;
      document.head.appendChild(s);
    }
    return () => { if (hls) hls.destroy(); };
  }, [src]);

  return (
    <video ref={ref} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", background: "#000" }}
      autoPlay muted playsInline controls />
  );
}

function toggleFullscreen(el: HTMLElement) {
  const body = el.closest(".cctv-card")?.querySelector(".cctv-body") as HTMLElement;
  if (!body) return;
  if (document.fullscreenElement) document.exitFullscreen();
  else body.requestFullscreen().catch(() => {});
}

function getBandung(page: number, search: string): Data {
  let list = BANDUNG_CAMS;
  if (search) {
    const q = search.toLowerCase();
    list = list.filter((c) => c.name.toLowerCase().includes(q) || (c.badge || "").toLowerCase().includes(q));
  }
  list = list.slice(0, PER_PAGE * MAX_PAGES_BANDUNG);
  const total = list.length;
  const pages = Math.ceil(total / PER_PAGE) || 1;
  const start = (page - 1) * PER_PAGE;
  return { cameras: list.slice(start, start + PER_PAGE), total, page, pages };
}

export default function CctvPage() {
  const router = useRouter();
  const [kota, setKota] = useState("jakarta");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (k: string, p: number, q: string) => {
    setLoading(true);
    setError(null);
    try {
      if (k === "bandung") {
        setData(getBandung(p, q));
        setLoading(false);
        return;
      }
      const params = new URLSearchParams({ kota: "jakarta", page: String(p) });
      if (q) params.set("q", q);
      const res = await fetch(`/api/cctv?${params}`);
      if (res.status === 401) { router.replace("/login"); return; }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "gagal memuat");
      setData(json);
    } catch (e: any) {
      setError(e?.message || "gagal memuat");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { load(kota, page, search); }, [kota, page]); // eslint-disable-line react-hooks/exhaustive-deps

  function gantiKota(id: string) {
    if (id === kota) return;
    setKota(id);
    setPage(1);
    setSearch("");
    setData(null);
  }

  function cari() { setPage(1); load(kota, 1, search); }

  const kotaLabel = KOTA.find((k) => k.id === kota)?.label || kota;

  return (
    <Shell judul="Pemantauan CCTV">
      <div className="wrap" style={{ maxWidth: 1300 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {KOTA.map((k) => (
            <button key={k.id} className={`fchip ${kota === k.id ? "active" : ""}`} onClick={() => gantiKota(k.id)}>
              {k.label}
            </button>
          ))}
        </div>

        <div style={{
          display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12,
          padding: "14px 20px", background: "var(--card)", borderRadius: 10,
          border: "1px solid var(--border)", marginBottom: 16,
        }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, whiteSpace: "nowrap", margin: 0 }}>
            CCTV Publik <span style={{ color: "var(--accent)" }}>{kotaLabel}</span>
          </h2>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && cari()}
            placeholder="Cari nama lokasi…"
            style={{
              flex: 1, minWidth: 200, maxWidth: 420,
              padding: "9px 14px", borderRadius: 8,
              border: "1px solid var(--border)", background: "var(--bg)",
              color: "var(--fg)", fontSize: 14, outline: "none",
            }}
          />
          {data && (
            <span style={{ fontSize: 13, color: "var(--muted)", marginLeft: "auto", whiteSpace: "nowrap" }}>
              {data.total} CCTV &bull; Hal. {data.page}/{data.pages}
            </span>
          )}
        </div>

        {loading && !data && (
          <div className="state"><div className="spinner" /> memuat CCTV {kotaLabel}…</div>
        )}
        {error && <div className="error">{error}</div>}

        {data && (
          <>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: 16,
            }}>
              {data.cameras.map((cam) => (
                <div key={cam.id} className="cctv-card" style={{
                  background: "var(--card)", border: "1px solid var(--border)",
                  borderRadius: 10, overflow: "hidden",
                }}>
                  <div className="cctv-body" style={{ position: "relative", aspectRatio: "16/9", background: "#000" }}>
                    {cam.type === "iframe" ? (
                      <iframe src={cam.embed} style={{ width: "100%", height: "100%", border: 0, display: "block" }}
                        loading="lazy" allowFullScreen referrerPolicy="no-referrer" />
                    ) : (
                      <HlsPlayer src={cam.embed} />
                    )}
                  </div>
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    gap: 8, padding: "10px 12px",
                  }}>
                    <span style={{
                      fontSize: 13, fontWeight: 500, flex: 1,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{cam.name}</span>
                    {cam.badge && (
                      <span style={{
                        fontSize: 11, padding: "2px 8px", borderRadius: 4,
                        background: "var(--accent)", color: "#fff", fontWeight: 600, flexShrink: 0,
                      }}>{cam.badge}</span>
                    )}
                    <button type="button" title="Fullscreen"
                      onClick={(e) => toggleFullscreen(e.currentTarget)}
                      style={{
                        background: "none", border: "1px solid var(--border)",
                        borderRadius: 6, padding: "4px 8px", cursor: "pointer",
                        color: "var(--fg)", fontSize: 14, flexShrink: 0,
                      }}>⛶</button>
                  </div>
                </div>
              ))}
            </div>

            {data.cameras.length === 0 && <div className="state">Tidak ada kamera ditemukan.</div>}

            {data.pages > 1 && (
              <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 20, flexWrap: "wrap" }}>
                {Array.from({ length: data.pages }, (_, i) => i + 1).map((p) => (
                  <button key={p} className={`fchip ${page === p ? "active" : ""}`}
                    onClick={() => setPage(p)} style={{ minWidth: 36 }}>{p}</button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Shell>
  );
}
