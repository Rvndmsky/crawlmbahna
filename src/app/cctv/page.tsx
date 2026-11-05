"use client";

import { useState } from "react";
import Shell from "../shell";

const CCTV_URL = "https://jakcctv.jakarta.go.id/publik";

export default function CctvPage() {
  const [loading, setLoading] = useState(true);

  return (
    <Shell judul="CCTV Jakarta">
      <div className="wrap" style={{ maxWidth: 1200 }}>
        <div className="hint" style={{ marginTop: 0, marginBottom: 16 }}>
          Pemantauan CCTV publik DKI Jakarta
        </div>

        <div style={{ position: "relative", width: "100%", minHeight: 600 }}>
          {loading && (
            <div className="state" style={{ position: "absolute", inset: 0, zIndex: 1 }}>
              <div className="spinner" />
              memuat CCTV Jakarta…
            </div>
          )}
          <iframe
            src={CCTV_URL}
            title="Jakarta CCTV Publik"
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
