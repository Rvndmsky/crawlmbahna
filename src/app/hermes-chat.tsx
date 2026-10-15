"use client";

import { Fragment, useEffect, useRef, useState } from "react";

// Popup chat ke Hermes Agent (pojok kanan bawah, ala chat CS).
// Riwayat disimpan di sessionStorage tab ini saja; dikirim utuh tiap giliran
// karena endpoint chat/completions Hermes stateless.

type Pesan = { role: "user" | "assistant"; content: string };
type Alat = { id: string; label: string; emoji?: string; selesai: boolean };

const SIMPAN = "hermes-chat";

function muat(): Pesan[] {
  try {
    const raw = sessionStorage.getItem(SIMPAN);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function simpan(p: Pesan[]) {
  try {
    sessionStorage.setItem(SIMPAN, JSON.stringify(p.slice(-40)));
  } catch {
    /* storage diblokir: riwayat cukup di memori */
  }
}

function layarSempit() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches;
}
function layarSentuh() {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
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

export default function HermesChat() {
  const [buka, setBuka] = useState(false);
  const [pesan, setPesan] = useState<Pesan[]>([]);
  const [draf, setDraf] = useState("");
  const [jalan, setJalan] = useState(false);
  const [alat, setAlat] = useState<Alat[]>([]);
  const [galat, setGalat] = useState("");
  const henti = useRef<AbortController | null>(null);
  const bawah = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setPesan(muat()), []);
  useEffect(() => {
    bawah.current?.scrollIntoView({ block: "end" });
  }, [pesan, alat, buka]);
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
    // Kolom ketik tumbuh mengikuti isi (dibatasi max-height di CSS).
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draf, buka]);

  async function kirim() {
    const q = draf.trim();
    if (!q || jalan) return;
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
      simpan(akhir);
      setJalan(false);
      setAlat([]);
      henti.current = null;
    }
  }

  function baru() {
    henti.current?.abort();
    setPesan([]);
    simpan([]);
    setGalat("");
  }

  return (
    <>
      {buka && (
        <section className="hermes-panel" role="dialog" aria-label="Chat Duryudana Agent">
          <header className="hermes-kepala">
            <div>
              <div className="hermes-nama">Duryudana Agent</div>
              <div className="hermes-sub">{jalan ? "sedang bekerja…" : "asisten riset · bisa cari web"}</div>
            </div>
            <button className="hermes-ikon" title="Percakapan baru" onClick={baru}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            </button>
            <button className="hermes-ikon" title="Tutup" onClick={() => setBuka(false)}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </header>

          <div className="hermes-isi">
            {pesan.length === 0 && (
              <div className="hermes-kosong">
                Tanya apa saja — Duryudana bisa mencari & membaca web sebelum menjawab.
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

          <form
            className="hermes-form"
            onSubmit={(e) => {
              e.preventDefault();
              kirim();
            }}
          >
            <textarea
              ref={input}
              rows={1}
              value={draf}
              placeholder="Tulis pesan…"
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
              <button type="button" className="hermes-kirim" onClick={() => henti.current?.abort()} title="Hentikan">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
              </button>
            ) : (
              <button type="submit" className="hermes-kirim" disabled={!draf.trim()} title="Kirim">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </button>
            )}
          </form>
        </section>
      )}

      <button
        className={`hermes-bubble ${buka ? "buka" : ""}`}
        aria-label={buka ? "Tutup chat Duryudana" : "Buka chat Duryudana"}
        onClick={() => setBuka((v) => !v)}
      >
        {buka ? (
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg>
        )}
        {jalan && !buka && <span className="hermes-titik" />}
      </button>
    </>
  );
}
