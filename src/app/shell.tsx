"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import ThemeToggle from "./theme-toggle";

// Kerangka tetap seluruh aplikasi: sidebar kiri untuk perpindahan halaman,
// bilah atas hanya untuk identitas pengguna, ganti tema, dan keluar.

const MENU = [
  { href: "/", label: "Dashboard" },
  { href: "/gettargetmbahna", label: "Subject Target" },
  { href: "/facebook", label: "Crawl Social Media" },
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
          mbah<span className="dot">na</span>
        </div>
        <nav className="sidebar-menu">
          {MENU.map((m) => (
            <button
              key={m.href}
              className={`sidebar-item ${aktif(m.href) ? "aktif" : ""}`}
              onClick={() => router.push(m.href)}
            >
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
