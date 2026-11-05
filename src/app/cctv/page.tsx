"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Shell from "../shell";

type Cam = { id: string; name: string; embed: string; type: "iframe" | "hls"; badge?: string };
type Data = { cameras: Cam[]; total: number; page: number; pages: number };

const KOTA = [
  { id: "jakarta", label: "Jakarta" },
  { id: "bandung", label: "Bandung" },
];

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
      const params = new URLSearchParams({ kota: k, page: String(p) });
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
    setData(null);
  }

  function cari() {
    setPage(1);
    load(kota, 1, search);
  }

  return (
    <Shell judul="Pemantauan CCTV">
      <div className="wrap" style={{ maxWidth: 1200 }}>

        {/* Tombol kota */}
        <div className="filter-row" style={{ marginBottom: 12, gap: 8, display: "flex", flexWrap: "wrap", alignItems: "center" }}>
          {KOTA.map((k) => (
            <button key={k.id} className={`fchip ${kota === k.id ? "active" : ""}`} onClick={() => gantiKota(k.id)}>
              {k.label}
            </button>
          ))}
          <input
            className="fb-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && cari()}
            placeholder="cari kamera…"
            style={{ maxWidth: 260 }}
          />
        </div>

        {/* Loading */}
        {loading && !data && (
          <div className="state"><div className="spinner" /> memuat CCTV…</div>
        )}

        {error && <div className="error">{error}</div>}

        {data && (
          <>
            <div className="meta" style={{ marginBottom: 12 }}>
              {data.total} kamera · Hal. {data.page}/{data.pages}
            </div>

            {/* Grid kamera */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
              gap: 16,
            }}>
              {data.cameras.map((cam) => (
                <div key={cam.id} className="card" style={{ overflow: "hidden", borderRadius: 12 }}>
                  <div style={{ position: "relative", aspectRatio: "16/9", background: "#000" }}>
                    {cam.type === "iframe" ? (
                      <iframe
                        src={cam.embed}
                        style={{ width: "100%", height: "100%", border: 0 }}
                        loading="lazy"
                        allowFullScreen
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <video
                        src={cam.embed}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        autoPlay
                        muted
                        playsInline
                        controls
                        onError={(e) => {
                          const v = e.currentTarget;
                          if (!(window as any).Hls) {
                            const s = document.createElement("script");
                            s.src = "https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.5.7/hls.min.js";
                            s.onload = () => {
                              const hls = new (window as any).Hls();
                              hls.loadSource(cam.embed);
                              hls.attachMedia(v);
                            };
                            document.head.appendChild(s);
                          } else {
                            const hls = new (window as any).Hls();
                            hls.loadSource(cam.embed);
                            hls.attachMedia(v);
                          }
                        }}
                      />
                    )}
                  </div>
                  <div style={{
                    padding: "10px 12px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 500, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {cam.name}
                    </span>
                    {cam.badge && (
                      <span className="move-badge" style={{ fontSize: 11, flexShrink: 0 }}>{cam.badge}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {data.cameras.length === 0 && (
              <div className="state">Tidak ada kamera ditemukan.</div>
            )}

            {/* Pagination */}
            {data.pages > 1 && (
              <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 20, flexWrap: "wrap" }}>
                {Array.from({ length: data.pages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    className={`fchip ${page === p ? "active" : ""}`}
                    onClick={() => setPage(p)}
                    style={{ minWidth: 36 }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Shell>
  );
}
