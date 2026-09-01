"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Shell from "../shell";
import { makeDetailSlug, todayYYYYMMDD } from "@/lib/slug";

type NewsItem = {
  title: string;
  url: string;
  source: string;
  platform: string;
  published: string;
  snippet: string;
  summary: string;
  sentiment: "positive" | "negative" | "neutral";
  sentiment_score: number;
  breaking: boolean;
};

type ApiResult = {
  query: string;
  items: NewsItem[];
  cached: boolean;
  searchedAt: number;
  error?: string;
};

function fmtTime(ms: number) {
  try {
    return new Date(ms).toLocaleString("id-ID");
  } catch {
    return "";
  }
}

function Results() {
  const params = useSearchParams();
  const router = useRouter();
  const q = params.get("q") || "";

  const [box, setBox] = useState(q);
  const [data, setData] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  async function run(query: string, fresh = false) {
    setLoading(true);
    setError(null);
    setData(null);
    setElapsed(0);
    const started = Date.now();
    const timer = setInterval(
      () => setElapsed(Math.round((Date.now() - started) / 1000)),
      1000
    );
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 180000);
    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(query)}${fresh ? "&fresh=1" : ""}`,
        { signal: ctrl.signal }
      );
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const json = (await res.json()) as ApiResult;
      if (!res.ok) throw new Error(json.error || "gagal mencari");
      setData(json);
    } catch (e: any) {
      setError(
        e?.name === "AbortError"
          ? "Terlalu lama. Coba lagi atau pilih model lebih cepat."
          : e?.message || "gagal mencari"
      );
    } finally {
      clearInterval(timer);
      clearTimeout(to);
      setLoading(false);
    }
  }

  useEffect(() => {
    setBox(q);
    if (q.trim()) run(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const s = box.trim();
    if (s) router.push(`/search?q=${encodeURIComponent(s)}`);
  }

  function openDossier(it: NewsItem) {
    const slug = makeDetailSlug(it.title, todayYYYYMMDD());
    const p = new URLSearchParams();
    if (it.url) p.set("u", it.url);
    p.set("t", it.title);
    router.push(`/detail/${slug}?${p.toString()}`);
  }

  return (
    <Shell
      judul="Pencarian Berita"
      aksi={
        <>
          <form className="mini-search" onSubmit={submit}>
            <input value={box} onChange={(e) => setBox(e.target.value)} />
            <button type="submit">Cari</button>
          </form>
          <button
            type="button"
            className="refresh ikon-btn"
            title="cari ulang (abaikan cache)"
            onClick={() => q.trim() && run(q, true)}
            disabled={loading}
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 11a8 8 0 1 0-2.3 5.7" />
              <path d="M20 5v6h-6" />
            </svg>
          </button>
        </>
      }
    >

      <div className="wrap">
        {loading && (
          <div className="state">
            <div className="spinner" />
            Menyisir web &amp; sosial media untuk "{q}"… <b>{elapsed}s</b>
          </div>
        )}

        {error && <div className="error">{error}</div>}

        {data && !loading && (
          <>
            <div className="meta">
              {data.items.length} hasil untuk <b>{data.query}</b>
              {data.cached && <span className="badge-cache">dari cache</span>}
              {data.searchedAt ? ` · ${fmtTime(data.searchedAt)}` : ""}
            </div>

            {data.items.length === 0 && (
              <div className="state">Tidak ada hasil. Coba kata kunci lain atau tekan Muat ulang.</div>
            )}

            {data.items.map((it, i) => (
              <article
                className="card clickable"
                key={i}
                onClick={() => openDossier(it)}
              >
                <div className="head">
                  {it.breaking && (
                    <span className="threat-badge sm">BREAKING</span>
                  )}
                  <span className="platform">{it.platform || "web"}</span>
                  <span className="title">{it.title}</span>
                </div>
                <div className="src">
                  {it.source}
                  {it.published ? ` · ${it.published}` : ""}
                </div>
                {it.summary && <div className="summary">{it.summary}</div>}
                {it.snippet && <div className="snippet">“{it.snippet}”</div>}
                <div className="foot">
                  <span className={`sent ${it.sentiment}`}>
                    {it.sentiment} ({it.sentiment_score.toFixed(2)})
                  </span>
                  <span className="dossier-link">Buka dossier intel </span>
                  <a
                    href={it.url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    buka sumber
                  </a>
                </div>
              </article>
            ))}
          </>
        )}
      </div>
    </Shell>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="state">memuat…</div>}>
      <Results />
    </Suspense>
  );
}
