"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "login gagal");
      router.replace("/");
    } catch (e: any) {
      setErr(e?.message || "login gagal");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          mbah<span className="dot">na</span>
        </div>
        <div className="login-sub">PUSAT PANTAU INTELIJEN · AKSES TERBATAS</div>

        <label>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email dinas"
          autoFocus
          required
        />

        <label>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
        />

        {err && <div className="error" style={{ marginTop: 4 }}>⚠ {err}</div>}

        <button className="save-btn" type="submit" disabled={loading} style={{ marginTop: 8 }}>
          {loading ? "memverifikasi…" : "Masuk"}
        </button>

        <div className="hint" style={{ marginTop: 14, textAlign: "center" }}>
          🔒 Sesi token sekali-pakai. Logout otomatis mencabut akses.
        </div>
      </form>
    </main>
  );
}
