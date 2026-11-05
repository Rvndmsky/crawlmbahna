"use client";

import { useState } from "react";
import Shell from "../shell";

const KOTA = [
  { id: "jakarta", label: "Jakarta", url: "https://jakcctv.jakarta.go.id/publik" },
  { id: "bandung", label: "Bandung", url: "https://pelindung.bandung.go.id/" },
];

export default function CctvPage() {
  const [aktif, setAktif] = useState(KOTA[0].id);
  const [loading, setLoading] = useState(true);

  const kota = KOTA.find((k) => k.id === aktif)!;

  function ganti(id: string) {
    if (id === aktif) return;
    setAktif(id);
    setLoading(true);
  }

  return (
    <Shell judul="Pemantauan CCTV">
      <div className="wrap" style={{ maxWidth: 1200 }}>
        <div className="filter-row" style={{ marginBottom: 16, gap: 8, display: "flex", flexWrap: "wrap" }}>
          {KOTA.map((k) => (
            <button
              key={k.id}
              className={`fchip ${aktif === k.id ? "active" : ""}`}
              onClick={() => ganti(k.id)}
            >
              {k.label}
            </button>
          ))}
        </div>

        <div style={{ position: "relative", width: "100%", minHeight: 600 }}>
          {loading && (
            <div className="state" style={{ position: "absolute", inset: 0, zIndex: 1 }}>
              <div className="spinner" />
              memuat CCTV {kota.label}…
            </div>
          )}
          <iframe
            key={aktif}
            src={kota.url}
            title={`CCTV Publik ${kota.label}`}
            style={{
              width: "100%",
              height: "calc(100vh - 160px)",
              minHeight: 600,
              border: "1px solid var(--border)",
              borderRadius: 12,
              background: "var(--card)",
            }}
            onLoad={() => setLoading(false)}
            allow="fullscreen"
          />
        </div>
      </div>
    </Shell>
  );
}
