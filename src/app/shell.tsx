"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import ThemeToggle from "./theme-toggle";

// Kerangka tetap seluruh aplikasi: sidebar kiri untuk perpindahan halaman,
// bilah atas hanya untuk identitas pengguna, ganti tema, dan keluar.

const ICONS: Record<string, React.ReactNode> = {
  "/": (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  "/gettarget": (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2" />
    </svg>
  ),
  "/cctv": (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12l5-3v6l-5-3z" /><rect x="7" y="7" width="10" height="10" rx="2" /><circle cx="12" cy="12" r="2" /><path d="M17 10l3-2M17 14l3 2M12 17v3" />
    </svg>
  ),
  "/cctv-bandung": (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12l5-3v6l-5-3z" /><rect x="7" y="7" width="10" height="10" rx="2" /><circle cx="12" cy="12" r="2" /><path d="M17 10l3-2M17 14l3 2M12 17v3" />
    </svg>
  ),
  "/infografis": (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" />
    </svg>
  ),
  "/settings": (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
};

const MENU = [
  { href: "/", label: "Dashboard" },
  { href: "/gettarget", label: "Subject Target" },
  { href: "/cctv", label: "CCTV Jakarta" },
  { href: "/cctv-bandung", label: "CCTV Bandung" },
  { href: "/infografis", label: "Infografis" },
  { href: "/settings", label: "Settings" },
];

export default function Shell({
  judul,
  aksi,
  children,
}: {
  judul?: string;
  aksi?: React.ReactNode; // tombol khas halaman (mis. refresh, pencarian)
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const [nama, setNama] = useState("");
  const [buka, setBuka] = useState(false); // sidebar di layar sempit

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j?.nama && setNama(j.nama))
      .catch(() => {});
  }, []);

  // Tutup sidebar tiap pindah halaman (hanya berpengaruh di layar sempit).
  useEffect(() => setBuka(false), [pathname]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  const aktif = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <div className="shell">
      <aside className={`sidebar ${buka ? "buka" : ""}`}>
        <div className="sidebar-brand" onClick={() => router.push("/")}>
          Duryu<span className="dot">dana</span>
        </div>
        <nav className="sidebar-menu">
          {MENU.map((m) => (
            <button
              key={m.href}
              className={`sidebar-item ${aktif(m.href) ? "aktif" : ""}`}
              onClick={() => router.push(m.href)}
            >
              <span className="sidebar-ikon">{ICONS[m.href]}</span>
              {m.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-kaki">
          <div className="sidebar-akun">
            <div className="sidebar-akun-label">Login as</div>
            <div className="sidebar-akun-nama">{nama || "…"}</div>
          </div>
          <button className="logout-btn" onClick={logout}>
            Logout
          </button>
          <div className="sidebar-tagline">Website Crawl Simple Membantu Pemerintah RI</div>
        </div>
      </aside>

      {buka && <div className="sidebar-tirai" onClick={() => setBuka(false)} />}

      <div className="shell-isi">
        <header className="topbar-baru">
          <button
            className="refresh ikon-btn hanya-sempit"
            title="menu"
            aria-label="buka menu"
            onClick={() => setBuka((v) => !v)}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          {judul && <div className="topbar-judul">{judul}</div>}
          <div style={{ flex: 1 }} />
          {aksi}
          <ThemeToggle />
        </header>

        {/* key pathname: React merakit ulang isi tiap pindah rute, sehingga
            animasi masuk terputar lagi. */}
        <main className="shell-utama" key={pathname}>
          {children}
        </main>
      </div>
    </div>
  );
}
