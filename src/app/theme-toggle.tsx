"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const t =
      (document.documentElement.getAttribute("data-theme") as
        | "dark"
        | "light") || "dark";
    setTheme(t);
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {}
  }

  return (
    <button
      className="refresh ikon-btn"
      title={theme === "dark" ? "mode terang" : "mode gelap"}
      aria-label={theme === "dark" ? "mode terang" : "mode gelap"}
      onClick={toggle}
      type="button"
    >
      {theme === "dark" ? (
        // matahari
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none"
          stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
        </svg>
      ) : (
        // bulan
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none"
          stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"
          strokeLinejoin="round">
          <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5z" />
        </svg>
      )}
    </button>
  );
}
