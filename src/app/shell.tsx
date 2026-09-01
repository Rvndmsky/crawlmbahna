"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import ThemeToggle from "./theme-toggle";

// Kerangka tetap seluruh aplikasi: sidebar kiri untuk perpindahan halaman,
// bilah atas hanya untuk identitas pengguna, ganti tema, dan keluar.

const MENU = [
  { href: "/", ikon: "🔥", label: "Dashboard" },
  { href: "/gettargetmbahna", ikon: "🎯", label: "Subject Target" },
  { href: "/facebook", ikon: "📘", label: "Crawl Social Media" },
  { href: "/infografis", ikon: "🖼", label: "Infografis" },
  { href: "/settings", ikon: "⚙", label: "Settings" },
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
              <span className="sidebar-ikon">{m.ikon}</span>
              <span>{m.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-kaki">Website Crawl Simple Membantu Pemerintah RI</div>
      </aside>

      {buka && <div className="sidebar-tirai" onClick={() => setBuka(false)} />}

      <div className="shell-isi">
        <header className="topbar-baru">
          <button
            className="refresh hanya-sempit"
            title="menu"
            onClick={() => setBuka((v) => !v)}
          >
            ☰
          </button>
          {judul && <div className="topbar-judul">{judul}</div>}
          <div style={{ flex: 1 }} />
          {aksi}
          <ThemeToggle />
          <span className="login-sebagai">
            Login as <b>{nama || "…"}</b>
          </span>
          <button className="logout-btn" onClick={logout}>
            Logout
          </button>
        </header>

        <main className="shell-utama">{children}</main>
      </div>
    </div>
  );
}
