"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ThemeToggle from "../theme-toggle";

// Section Infografis: daftar hasil yang sudah dibuat + tombol Baru untuk
// mengunggah dokumen (PDF/DOCX). Agen menilai kelayakan isinya lebih dulu;
// dokumen di luar cakupan ditolak beserta alasannya.

type Spec = {
  judul: string;
  subjudul: string;
  kategori: string;
  ringkasan: string;
  sorotan: { nilai: string; label: string; catatan: string }[];
  poin: { judul: string; isi: string }[];
  linimasa: { waktu: string; peristiwa: string }[];
  kesimpulan: string;
  sumber: string;
};

type Item = {
  id: string;
  judul: string;
  kategori: string;
  namaBerkas: string;
  dibuatPada: number;
  spec: Spec;
};

type Mode = "daftar" | "baru" | "lihat";

function fmtTime(ms: number) {
  try {
    return new Date(ms).toLocaleString("id-ID");
  } catch {
    return "";
  }
}

export default function InfografisPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<Mode>("daftar");
  const [items, setItems] = useState<Item[]>([]);
  const [aktif, setAktif] = useState<Item | null>(null);
  const [svg, setSvg] = useState("");
  const [proses, setProses] = useState(false);
  const [detik, setDetik] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [tolak, setTolak] = useState<{ alasan: string; namaBerkas: string } | null>(null);
  const [seret, setSeret] = useState(false);
  const [memuat, setMemuat] = useState(true);
  const [judul, setJudul] = useState("");
  const [berkas, setBerkas] = useState<File | null>(null);

  async function muatDaftar() {
    try {
      const res = await fetch("/api/infografis");
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const json = await res.json();
      setItems(Array.isArray(json.items) ? json.items : []);
    } catch {
      /* abaikan */
    } finally {
      setMemuat(false);
    }
  }

  useEffect(() => {
    muatDaftar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pilihBerkas(file: File) {
    const nama = file.name.toLowerCase();
    if (!nama.endsWith(".pdf") && !nama.endsWith(".docx")) {
      setError("Hanya berkas .pdf atau .docx yang diterima.");
      return;
    }
    setError(null);
    setTolak(null);
    setBerkas(file);
  }

  async function unggah() {
    const file = berkas;
    if (!file) {
      setError("Pilih berkas PDF atau DOCX dulu.");
      return;
    }

    setProses(true);
    setError(null);
    setTolak(null);
    setDetik(0);
    const mulai = Date.now();
    const timer = setInterval(() => setDetik(Math.round((Date.now() - mulai) / 1000)), 1000);

    try {
      const fd = new FormData();
      fd.append("file", file);
      if (judul.trim()) fd.append("judul", judul.trim());
      const res = await fetch("/api/infografis", { method: "POST", body: fd });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "gagal memproses berkas");

      if (json.diterima === false) {
        setTolak({ alasan: json.alasan, namaBerkas: json.namaBerkas });
        return;
      }
      setAktif(json.item);
      setSvg(json.svg);
      setMode("lihat");
      setJudul("");
      setBerkas(null);
      muatDaftar();
    } catch (e: any) {
      setError(e?.message || "gagal memproses berkas");
    } finally {
      clearInterval(timer);
      setProses(false);
    }
  }

  async function buka(it: Item) {
    setAktif(it);
    setSvg("");
    setMode("lihat");
    try {
      const res = await fetch(`/api/infografis/img?id=${encodeURIComponent(it.id)}`);
      setSvg(res.ok ? await res.text() : "");
    } catch {
      setSvg("");
    }
  }

  function keDaftar() {
    setMode("daftar");
    setTolak(null);
    setError(null);
  }

  // Unduh PNG: SVG digambar ke canvas di browser, tanpa pustaka tambahan.
  function unduhPng() {
    if (!svg) return;
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = 1080;
      c.height = 1350;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#fcfcfb";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => {
        if (!b) return;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(b);
        a.download = `infografis-${aktif?.id || "mbahna"}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }, "image/png");
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  }

  function unduhSvg() {
    if (!svg) return;
    const b = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = `infografis-${aktif?.id || "mbahna"}.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  return (
    <>
      <header className="topbar">
        <div className="logo" style={{ cursor: "pointer" }} onClick={() => router.push("/")}>
          mbah<span className="dot">na</span>
        </div>
        <div style={{ flex: 1, fontWeight: 600 }}>🖼 Infografis</div>
        <button
          type="button"
          className="refresh"
          title="pantau individu"
          onClick={() => router.push("/gettargetmbahna")}
        >
          🎯
        </button>
        <button
          type="button"
          className="refresh"
          title="pantau Facebook"
          onClick={() => router.push("/facebook")}
        >
          📘
        </button>
        <button type="button" className="refresh" title="dashboard" onClick={() => router.push("/")}>
          🔥
        </button>
        <ThemeToggle />
      </header>

      <div className="wrap" style={{ maxWidth: 980 }}>
        {/* Baris aksi */}
        <div className="info-bar">
          {mode === "daftar" ? (
            <>
              <div>
                <div className="info-bar-judul">Infografis dari Dokumen</div>
                <div className="hint" style={{ marginTop: 2 }}>
                  {items.length} tersimpan · unggah PDF/DOCX, agen menyusun gambarnya
                </div>
              </div>
              <button
                className="save-btn"
                onClick={() => {
                  setJudul("");
                  setBerkas(null);
                  setTolak(null);
                  setError(null);
                  setMode("baru");
                }}
              >
                + Baru
              </button>
            </>
          ) : (
            <>
              <div>
                <div className="info-bar-judul">
                  {mode === "baru" ? "Buat Infografis Baru" : aktif?.judul || "Infografis"}
                </div>
                {mode === "lihat" && aktif && (
                  <div className="hint" style={{ marginTop: 2 }}>
                    {aktif.kategori} · dari {aktif.namaBerkas} · {fmtTime(aktif.dibuatPada)}
                  </div>
                )}
              </div>
              <button className="btn" onClick={keDaftar} disabled={proses}>
                ← Daftar
              </button>
            </>
          )}
        </div>

        {/* Mode: unggah */}
        {mode === "baru" && (
          <>
            <div className="hint" style={{ marginBottom: 14 }}>
              Cakupan yang diterima: politik, pemerintahan, hukum, keamanan, ekonomi negara,
              dan isu sosial yang berdampak pada kebijakan. Di luar itu — resep, tugas kuliah,
              CV, brosur jualan — <b>akan ditolak</b> beserta alasannya.
            </div>

            <div className="form-group">
              <label>Judul infografis</label>
              <input
                type="text"
                value={judul}
                onChange={(e) => setJudul(e.target.value)}
                placeholder="mis. Dampak Kenaikan BBM terhadap Daya Beli"
                maxLength={60}
                disabled={proses}
              />
              <div className="hint">
                {judul.length}/60 · judul ini yang tampil di daftar dan di gambarnya.
                Dikosongkan = judul disusun sendiri dari isi dokumen.
              </div>
            </div>

            <div className="form-group">
              <label>Berkas dokumen</label>
              <div
                className={`unggah ${seret ? "seret" : ""} ${proses ? "sibuk" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setSeret(true);
                }}
                onDragLeave={() => setSeret(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setSeret(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f && !proses) pilihBerkas(f);
                }}
                onClick={() => !proses && inputRef.current?.click()}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) pilihBerkas(f);
                    e.target.value = "";
                  }}
                />
                {proses ? (
                  <>
                    <div className="spinner" />
                    <div className="unggah-judul">Membaca &amp; menyusun infografis… {detik}s</div>
                    <div className="hint" style={{ marginTop: 4 }}>
                      Biasanya 15–45 detik, tergantung panjang dokumen.
                    </div>
                  </>
                ) : berkas ? (
                  <>
                    <div className="unggah-ikon">📄</div>
                    <div className="unggah-judul">{berkas.name}</div>
                    <div className="hint" style={{ marginTop: 4 }}>
                      {(berkas.size / 1024 / 1024).toFixed(2)} MB · klik untuk ganti berkas
                    </div>
                  </>
                ) : (
                  <>
                    <div className="unggah-ikon">⬆</div>
                    <div className="unggah-judul">Tarik berkas ke sini, atau klik untuk memilih</div>
                    <div className="hint" style={{ marginTop: 4 }}>
                      PDF atau DOCX · maksimal 12 MB
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="info-aksi">
              <button className="save-btn" onClick={unggah} disabled={proses || !berkas}>
                {proses ? "Memproses…" : "Buat Infografis"}
              </button>
              {berkas && !proses && (
                <button className="btn" onClick={() => setBerkas(null)}>
                  Hapus berkas
                </button>
              )}
            </div>

            {error && <div className="error">⚠ {error}</div>}

            {tolak && (
              <div className="tolak-box">
                <div className="tolak-judul">⛔ Dokumen ditolak</div>
                <div className="tolak-berkas">{tolak.namaBerkas}</div>
                <div className="tolak-alasan">{tolak.alasan}</div>
              </div>
            )}
          </>
        )}

        {/* Mode: lihat hasil */}
        {mode === "lihat" && aktif && (
          <>
            <div className="info-aksi">
              <button className="save-btn" onClick={unduhPng} disabled={!svg}>
                ⬇ Unduh PNG
              </button>
              <button className="btn" onClick={unduhSvg} disabled={!svg}>
                ⬇ Unduh SVG
              </button>
            </div>

            {svg ? (
              <div className="info-pratinjau" dangerouslySetInnerHTML={{ __html: svg }} />
            ) : (
              <div className="state">
                <div className="spinner" />
                memuat gambar…
              </div>
            )}

            <div className="panel" style={{ marginTop: 18 }}>
              <div className="panel-title">Isi yang dipakai</div>
              {aktif.spec.ringkasan && <div className="summary">{aktif.spec.ringkasan}</div>}
              {aktif.spec.sorotan.length > 0 && (
                <div className="chips" style={{ marginTop: 10 }}>
                  {aktif.spec.sorotan.map((s, i) => (
                    <span className="chip" key={i}>
                      <b>{s.nilai}</b> — {s.label}
                    </span>
                  ))}
                </div>
              )}
              <ul className="bullets" style={{ marginTop: 12 }}>
                {aktif.spec.poin.map((p, i) => (
                  <li key={i}>
                    <b>{p.judul}</b> — {p.isi}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {/* Mode: daftar */}
        {mode === "daftar" && (
          <>
            {memuat && (
              <div className="state">
                <div className="spinner" />
                memuat daftar…
              </div>
            )}

            {!memuat && items.length === 0 && (
              <div className="panel" style={{ textAlign: "center", padding: "38px 20px" }}>
                <div style={{ fontSize: 30, marginBottom: 10 }}>🖼</div>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Belum ada infografis</div>
                <div className="hint" style={{ marginTop: 0, marginBottom: 16 }}>
                  Unggah dokumen PDF atau DOCX untuk membuat yang pertama.
                </div>
                <button className="save-btn" onClick={() => setMode("baru")}>
                  + Baru
                </button>
              </div>
            )}

            {items.length > 0 && (
              <div className="info-daftar">
                {items.map((it) => (
                  <div className="info-baris" key={it.id} onClick={() => buka(it)}>
                    <div className="info-baris-utama">
                      <div className="info-baris-judul">{it.judul}</div>
                      <div className="muted" style={{ fontSize: 12.5 }}>
                        {it.kategori} · {it.namaBerkas} · {fmtTime(it.dibuatPada)}
                      </div>
                    </div>
                    <span className="info-baris-buka">buka →</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
