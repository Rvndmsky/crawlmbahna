"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

// Popup chat ke Duryudana Agent (Hermes Agent di VPS), pojok kanan bawah.
// Dipasang di root layout supaya jawaban yang sedang mengalir tidak putus
// saat pindah halaman. Riwayat disimpan per thread di server
// (/api/hermes/threads) sehingga tetap ada setelah tab ditutup / ganti
// perangkat. Endpoint chat Hermes stateless: tiap giliran mengirim isi
// thread utuh.

type Pesan = { role: "user" | "assistant"; content: string };
type Alat = { id: string; label: string; emoji?: string; selesai: boolean };
type Thread = { id: string; title: string; updatedAt: number };

const KUNCI_AKTIF = "duryudana-thread-aktif";
const MAKS_TINGGI = 140; // px, tinggi maksimum kolom ketik
const SARAN = [
  "Berita politik nasional hari ini",
  "Isu demo / aksi massa terbaru",
  "Ringkas isu yang sedang trending",
];

function idBaru(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
function ingatAktif(id: string | null) {
  try {
    if (id) localStorage.setItem(KUNCI_AKTIF, id);
    else localStorage.removeItem(KUNCI_AKTIF);
  } catch {
    /* storage diblokir: thread aktif cukup di memori */
  }
}
function bacaAktif(): string | null {
  try {
    return localStorage.getItem(KUNCI_AKTIF);
  } catch {
    return null;
  }
}

function layarSempit() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches;
}
function layarSentuh() {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
}

function waktuRelatif(ms: number): string {
  const d = Math.floor((Date.now() - ms) / 1000);
  if (d < 60) return "baru saja";
  if (d < 3600) return `${Math.floor(d / 60)} mnt lalu`;
  if (d < 86400) return `${Math.floor(d / 3600)} jam lalu`;
  if (d < 7 * 86400) return `${Math.floor(d / 86400)} hari lalu`;
  return new Date(ms).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

// Teks -> React: baris baru, **tebal**, dan URL jadi tautan.
function Teks({ isi }: { isi: string }) {
  const bagian = isi.split(/(\*\*[^*]+\*\*|https?:\/\/[^\s)]+)/g);
  return (
    <>
      {bagian.map((b, i) => {
        if (b.startsWith("**") && b.endsWith("**") && b.length > 4)
          return <strong key={i}>{b.slice(2, -2)}</strong>;
        if (/^https?:\/\//.test(b))
          return (
            <a key={i} href={b} target="_blank" rel="noopener noreferrer">
              {b}
            </a>
          );
        return <Fragment key={i}>{b}</Fragment>;
      })}
    </>
  );
}

const Ikon = {
  riwayat: <path d="M3 12a9 9 0 1 0 3-6.7M3 4v4h4M12 7v5l3 2" />,
  baru: <path d="M12 5v14M5 12h14" />,
  tutup: <path d="M6 6l12 12M18 6L6 18" />,
  kembali: <path d="M15 6l-6 6 6 6" />,
  hapus: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
};
function Svg({ d, ukuran = 16 }: { d: React.ReactNode; ukuran?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={ukuran} height={ukuran} fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {d}
    </svg>
  );
}

export default function HermesChat() {
  const pathname = usePathname() || "/";
  const [buka, setBuka] = useState(false);
  const [lihatRiwayat, setLihatRiwayat] = useState(false);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [aktif, setAktif] = useState<string | null>(null);
  const [pesan, setPesan] = useState<Pesan[]>([]);
  const [memuat, setMemuat] = useState(false);
  const [draf, setDraf] = useState("");
  const [jalan, setJalan] = useState(false);
  const [alat, setAlat] = useState<Alat[]>([]);
  const [galat, setGalat] = useState("");
  const henti = useRef<AbortController | null>(null);
  const bawah = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const sudahMuat = useRef(false);

  const muatDaftar = useCallback(async () => {
    try {
      const r = await fetch("/api/hermes/threads", { cache: "no-store" });
      if (r.ok) setThreads((await r.json()).threads || []);
    } catch {
      /* daftar riwayat opsional */
    }
  }, []);

  const bukaThread = useCallback(async (id: string) => {
    setMemuat(true);
    setGalat("");
    try {
      const r = await fetch(`/api/hermes/threads?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!r.ok) throw new Error(r.status === 404 ? "percakapan tidak ditemukan" : `gagal (${r.status})`);
      const j = await r.json();
      setAktif(id);
      ingatAktif(id);
      setPesan(j.messages || []);
    } catch (err: any) {
      setAktif(null);
      ingatAktif(null);
      setPesan([]);
      if (err?.message !== "percakapan tidak ditemukan") setGalat(err?.message || "gagal memuat");
    } finally {
      setMemuat(false);
    }
  }, []);

  // Pertama kali dibuka: ambil daftar thread & lanjutkan thread terakhir.
  useEffect(() => {
    if (!buka || sudahMuat.current) return;
    sudahMuat.current = true;
    muatDaftar();
    const terakhir = bacaAktif();
    if (terakhir) bukaThread(terakhir);
  }, [buka, muatDaftar, bukaThread]);

  useEffect(() => {
    bawah.current?.scrollIntoView({ block: "end" });
  }, [pesan, alat, buka, lihatRiwayat]);

  useEffect(() => {
    if (!buka) return;
    // Di HP panel tampil layar penuh: kunci scroll halaman di belakangnya, dan
    // jangan langsung munculkan keyboard begitu chat dibuka.
    if (layarSempit()) {
      const lama = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = lama;
      };
    }
    input.current?.focus();
  }, [buka]);

  useEffect(() => {
    // Kolom ketik tumbuh mengikuti isi sampai MAKS_TINGGI; baru setelah itu
    // boleh scroll. scrollHeight tak memuat border, jadi tanpa ini browser
    // memunculkan scrollbar bawaan walau isinya cuma satu baris.
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    const tinggi = el.scrollHeight;
    el.style.height = `${Math.min(tinggi, MAKS_TINGGI)}px`;
    el.style.overflowY = tinggi > MAKS_TINGGI ? "auto" : "hidden";
  }, [draf, buka, lihatRiwayat]);

  async function simpan(id: string, isi: Pesan[]) {
    try {
      const r = await fetch("/api/hermes/threads", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, messages: isi }),
      });
      if (!r.ok) throw new Error();
      const { thread } = await r.json();
      setThreads((t) => [thread, ...t.filter((x) => x.id !== id)]);
    } catch {
      setGalat("Jawaban diterima, tapi riwayat gagal disimpan.");
    }
  }

  async function kirim(teks?: string) {
    const q = (teks ?? draf).trim();
    if (!q || jalan || memuat) return;
    const id = aktif || idBaru();
    if (!aktif) {
      setAktif(id);
      ingatAktif(id);
    }
    const riwayat: Pesan[] = [...pesan, { role: "user", content: q }];
    setPesan([...riwayat, { role: "assistant", content: "" }]);
    setDraf("");
    setGalat("");
    setAlat([]);
    setJalan(true);
    const ac = new AbortController();
    henti.current = ac;
    let jawaban = "";

    try {
      const res = await fetch("/api/hermes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: riwayat }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error || `gagal (${res.status})`);
      }

      // Urai SSE: blok dipisah baris kosong; baris ":" = keepalive.
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let sisa = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        sisa += dec.decode(value, { stream: true });
        const blok = sisa.split("\n\n");
        sisa = blok.pop() || "";
        for (const b of blok) {
          let ev = "";
          let data = "";
          for (const baris of b.split("\n")) {
            if (baris.startsWith(":")) continue;
            if (baris.startsWith("event:")) ev = baris.slice(6).trim();
            else if (baris.startsWith("data:")) data += baris.slice(5).trim();
          }
          if (!data || data === "[DONE]") continue;
          let j: any;
          try {
            j = JSON.parse(data);
          } catch {
            continue;
          }
          if (ev === "hermes.tool.progress") {
            setAlat((a) =>
              j.status === "running"
                ? [...a, { id: j.toolCallId, label: j.label || j.tool, emoji: j.emoji, selesai: false }]
                : a.map((x) => (x.id === j.toolCallId ? { ...x, selesai: true } : x))
            );
            continue;
          }
          if (j.error) throw new Error(j.error.message || "Duryudana error");
          const d = j?.choices?.[0]?.delta?.content;
          if (d) {
            jawaban += d;
            setPesan([...riwayat, { role: "assistant", content: jawaban }]);
          }
        }
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") setGalat(err?.message || "gagal menghubungi Duryudana");
    } finally {
      const akhir: Pesan[] = jawaban
        ? [...riwayat, { role: "assistant", content: jawaban }]
        : riwayat;
      setPesan(akhir);
      setJalan(false);
      setAlat([]);
      henti.current = null;
      simpan(id, akhir);
    }
  }

  function baru() {
    henti.current?.abort();
    setAktif(null);
    ingatAktif(null);
    setPesan([]);
    setGalat("");
    setLihatRiwayat(false);
  }

  async function pilih(id: string) {
    if (jalan) henti.current?.abort();
    setLihatRiwayat(false);
    if (id !== aktif) await bukaThread(id);
  }

  async function hapus(t: Thread) {
    if (!window.confirm(`Hapus percakapan "${t.title}"?`)) return;
    try {
      const r = await fetch(`/api/hermes/threads?id=${encodeURIComponent(t.id)}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
      setThreads((x) => x.filter((y) => y.id !== t.id));
      if (t.id === aktif) baru();
    } catch {
      setGalat("Gagal menghapus percakapan.");
    }
  }

  if (pathname.startsWith("/login")) return null;

  const judulAktif = threads.find((t) => t.id === aktif)?.title;

  return (
    <>
      {buka && (
        <section className="hermes-panel" role="dialog" aria-label="Chat Duryudana Agent">
          <header className="hermes-kepala">
            {lihatRiwayat ? (
              <button className="hermes-ikon" title="Kembali ke chat" aria-label="Kembali ke chat"
                onClick={() => setLihatRiwayat(false)}>
                <Svg d={Ikon.kembali} />
              </button>
            ) : (
              <div className={`hermes-avatar ${jalan ? "kerja" : ""}`} aria-hidden>D</div>
            )}
            <div className="hermes-identitas">
              <div className="hermes-nama">{lihatRiwayat ? "Riwayat percakapan" : "Duryudana Agent"}</div>
              <div className="hermes-sub">
                {lihatRiwayat ? (
                  `${threads.length} percakapan tersimpan`
                ) : (
                  <>
                    <span className={`hermes-status-titik ${jalan ? "kerja" : ""}`} />
                    {jalan ? "sedang bekerja…" : judulAktif || "online · asisten riset"}
                  </>
                )}
              </div>
            </div>
            {!lihatRiwayat && (
              <button className="hermes-ikon" title="Riwayat" aria-label="Riwayat percakapan"
                onClick={() => { setLihatRiwayat(true); muatDaftar(); }}>
                <Svg d={Ikon.riwayat} />
              </button>
            )}
            <button className="hermes-ikon" title="Percakapan baru" aria-label="Percakapan baru" onClick={baru}>
              <Svg d={Ikon.baru} />
            </button>
            <button className="hermes-ikon" title="Tutup" aria-label="Tutup chat" onClick={() => setBuka(false)}>
              <Svg d={Ikon.tutup} />
            </button>
          </header>

          {lihatRiwayat ? (
            <div className="hermes-riwayat">
              {threads.length === 0 ? (
                <div className="hermes-riwayat-kosong">Belum ada percakapan tersimpan.</div>
              ) : (
                threads.map((t) => (
                  <div key={t.id} className={`hermes-thread ${t.id === aktif ? "aktif" : ""}`}>
                    <button className="hermes-thread-buka" onClick={() => pilih(t.id)}>
                      <span className="hermes-thread-judul">{t.title}</span>
                      <span className="hermes-thread-waktu">{waktuRelatif(t.updatedAt)}</span>
                    </button>
                    <button className="hermes-thread-hapus" title="Hapus" aria-label={`Hapus ${t.title}`}
                      onClick={() => hapus(t)}>
                      <Svg d={Ikon.hapus} ukuran={15} />
                    </button>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="hermes-isi">
              {memuat && <div className="hermes-memuat">Memuat percakapan…</div>}
              {!memuat && pesan.length === 0 && (
                <div className="hermes-kosong">
                  <div className="hermes-kosong-avatar" aria-hidden>D</div>
                  <div className="hermes-kosong-judul">Halo, saya Duryudana</div>
                  <div className="hermes-kosong-teks">
                    Tanya apa saja — saya bisa mencari & membaca web sebelum menjawab.
                  </div>
                  <div className="hermes-saran">
                    {SARAN.map((s) => (
                      <button key={s} type="button" onClick={() => kirim(s)}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {pesan.map((p, i) =>
                p.role === "assistant" && !p.content ? null : (
                  <div key={i} className={`hermes-gelembung ${p.role === "user" ? "saya" : "dia"}`}>
                    <Teks isi={p.content} />
                  </div>
                )
              )}
              {jalan && (
                <div className="hermes-status">
                  {alat.map((a) => (
                    <div key={a.id} className={`hermes-alat ${a.selesai ? "selesai" : ""}`}>
                      <span>{a.emoji || "🔧"}</span> {a.label}
                    </div>
                  ))}
                  {!pesan[pesan.length - 1]?.content && (
                    <div className="hermes-ketik"><i /><i /><i /></div>
                  )}
                </div>
              )}
              {galat && <div className="hermes-galat">{galat}</div>}
              <div ref={bawah} />
            </div>
          )}

          {!lihatRiwayat && (
            <form
              className="hermes-form"
              onSubmit={(e) => {
                e.preventDefault();
                kirim();
              }}
            >
              <div className="hermes-komposer">
                <textarea
                  ref={input}
                  rows={1}
                  value={draf}
                  placeholder="Tanya Duryudana…"
                  enterKeyHint="send"
                  onChange={(e) => setDraf(e.target.value)}
                  onKeyDown={(e) => {
                    // Keyboard HP: Enter = baris baru, kirim lewat tombol.
                    if (e.key === "Enter" && !e.shiftKey && !layarSentuh()) {
                      e.preventDefault();
                      kirim();
                    }
                  }}
                />
                {jalan ? (
                  <button type="button" className="hermes-kirim henti" onClick={() => henti.current?.abort()}
                    title="Hentikan" aria-label="Hentikan">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="3" /></svg>
                  </button>
                ) : (
                  <button type="submit" className="hermes-kirim" disabled={!draf.trim() || memuat}
                    title="Kirim" aria-label="Kirim">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
                  </button>
                )}
              </div>
              <div className="hermes-petunjuk">Enter kirim · Shift+Enter baris baru</div>
            </form>
          )}
        </section>
      )}

      <button
        className={`hermes-bubble ${buka ? "buka" : ""}`}
        aria-label={buka ? "Tutup chat Duryudana" : "Buka chat Duryudana"}
        onClick={() => setBuka((v) => !v)}
      >
        {buka ? (
          <Svg d={Ikon.tutup} ukuran={22} />
        ) : (
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg>
        )}
        {jalan && !buka && <span className="hermes-titik" />}
      </button>
    </>
  );
}
