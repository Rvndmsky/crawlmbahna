"use client";

import { useState } from "react";
import Shell from "../shell";

const CCTV_URL = "https://pelindung.bandung.go.id/";

export default function CctvBandungPage() {
  const [loading, setLoading] = useState(true);

  return (
    <Shell judul="Pemantauan CCTV Bandung">
      <div className="wrap" style={{ maxWidth: 1200 }}>
        <div className="hint" style={{ marginTop: 0, marginBottom: 16 }}>
          Pemantauan CCTV publik Kota Bandung
        </div>

        <div style={{ position: "relative", width: "100%", minHeight: 600 }}>
          {loading && (
            <div className="state" style={{ position: "absolute", inset: 0, zIndex: 1 }}>
              <div className="spinner" />
              memuat CCTV Bandung…
            </div>
          )}
          <iframe
            src={CCTV_URL}
            title="Bandung CCTV Publik"
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
