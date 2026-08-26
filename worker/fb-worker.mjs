// Worker crawl Facebook — Page & grup PUBLIK saja, pakai Chromium (Playwright).
//
// Kenapa terpisah dari aplikasi Next.js: butuh browser yang hidup terus + folder
// profil yang bisa ditulis. Vercel serverless tidak bisa (read-only, mati tiap
// request, batas 60 detik). Jadi worker ini jalan di PC/VPS lalu MENGIRIM hasil
// ke website lewat POST /api/fb/ingest.
//
// Login dilakukan MANUAL sekali (mode --login, jendela browser terbuka, kamu
// yang mengetik sandi + 2FA). Sandi tidak pernah disimpan skrip ini — yang
// tersimpan hanya cookie sesi di folder profil Chromium.
//
// Pemakaian:
//   npm install && npx playwright install chromium
//   npm run login     -> login manual sekali
//   npm run check     -> cek sesi masih hidup
//   npm run crawl     -> sisir sekali
//   npm run watch     -> sisir terus tiap FB_LOOP_MINUTES

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const argVals = (f) =>
  argv.reduce((acc, a, i) => (argv[i - 1] === f ? [...acc, a] : acc), []);

const CFG = {
  appUrl: (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, ""),
  token: process.env.FB_WORKER_TOKEN || "",
  // Cadangan login otomatis. Kosongkan kalau mau login manual saja (lebih aman:
  // Facebook agresif menandai login skrip, dan 2FA tidak bisa dilewati di sini).
  email: process.env.FB_EMAIL || "",
  password: process.env.FB_PASSWORD || "",
  profileDir: path.resolve(HERE, process.env.FB_PROFILE_DIR || "fb-profile"),
  headless: has("--headful") ? false : process.env.FB_HEADLESS !== "false",
  maxScroll: Number(process.env.FB_MAX_SCROLL) || 4,
  delayMs: Number(process.env.FB_DELAY_MS) || 4000,
  perQuery: Number(process.env.FB_PER_QUERY) || 12,
  maxQueries: Number(process.env.FB_MAX_QUERIES) || 12,
  // Buka tiap post untuk ambil isi penuh + komentar teratas. Ini bagian paling
  // lambat (satu kunjungan halaman per post), jadi jumlahnya dibatasi.
  withComments: process.env.FB_FETCH_COMMENTS !== "false",
  detailPerQuery: Number(process.env.FB_DETAIL_PER_QUERY) || 5,
  commentsPerPost: Number(process.env.FB_COMMENTS_PER_POST) || 8,
  loopMinutes: Number(process.env.FB_LOOP_MINUTES) || 60,
  // Tema pantauan Facebook: aksi jalanan & tekanan politik ke pemerintahan.
  // Kueri tema ini dipakai apa adanya; kata kunci juga digabung dengan tiap
  // nama target bila daftar target ada.
  themes: (
    process.env.FB_THEMES ||
    "demo,unjuk rasa,demo indonesia,prabowo demo,prabowo lengser,demo mahasiswa,aksi massa"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  keywords: (process.env.FB_KEYWORDS || "demo,unjuk rasa,aksi massa")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (ms) => ms + Math.floor(Math.random() * ms * 0.5);

// ---------- daftar kueri ----------
// Nama target diambil dari data/targets.json milik aplikasi (kalau worker jalan
// di mesin yang sama), digabung kata kunci isu. Bisa dipaksa lewat --q.
function readTargets() {
  const file = path.join(ROOT, "data", "targets.json");
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    if (Array.isArray(raw)) {
      return raw.map((t) => String(t?.name || "")).filter(Boolean);
    }
  } catch {
    /* tidak ada file -> lewat */
  }
  return [];
}

function buildQueries() {
  const forced = argVals("--q");
  if (forced.length) return forced.slice(0, CFG.maxQueries);

  const envQ = (process.env.FB_QUERIES || "")
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (envQ.length) return envQ.slice(0, CFG.maxQueries);

  // Tema aksi/politik selalu disisir lebih dulu — itu fokus pemantauan di
  // Facebook. Nama target hanya menambah, bukan menggeser.
  const out = [...CFG.themes];
  for (const n of readTargets()) {
    for (const k of CFG.keywords) out.push(n + " " + k);
  }
  return out.slice(0, CFG.maxQueries);
}

// ---------- browser ----------
async function openContext({ headless }) {
  fs.mkdirSync(CFG.profileDir, { recursive: true });
  return await chromium.launchPersistentContext(CFG.profileDir, {
    headless,
    viewport: { width: 1280, height: 900 },
    locale: "id-ID",
    timezoneId: "Asia/Jakarta",
    args: ["--disable-blink-features=AutomationControlled"],
  });
}

// Cookie c_user saja TIDAK cukup: Facebook juga menyetelnya untuk "akun
// tersimpan" (layar "Lanjutkan sebagai ..."), yang belum berupa sesi aktif —
// halaman pencarian akan membalas 404. Cookie hanya dipakai saringan awal.
async function hasCookie(ctx) {
  const cookies = await ctx.cookies("https://www.facebook.com");
  return cookies.some((c) => c.name === "c_user" && c.value);
}

// Layar pemilih profil punya tombol "Lanjutkan"/"Continue as". Kalau muncul,
// klik supaya sesi benar-benar terbuka.
async function clickContinue(page) {
  for (const re of [/^lanjutkan/i, /^continue as/i, /^continue$/i]) {
    try {
      const btn = page.getByRole("button", { name: re }).first();
      if (await btn.isVisible({ timeout: 1500 })) {
        await btn.click();
        await sleep(4000);
        return true;
      }
    } catch {
      /* pola ini tidak ada -> coba berikutnya */
    }
  }
  return false;
}

// Uji sesungguhnya: buka halaman pencarian. Hanya sesi aktif yang dilayani;
// akun tersimpan atau anonim mendapat 404.
async function sessionActive(ctx) {
  if (!(await hasCookie(ctx))) return false;
  const page = ctx.pages()[0] || (await ctx.newPage());
  const SEARCH = "https://www.facebook.com/search/posts?q=indonesia";
  try {
    const resp = await page.goto(SEARCH, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    await sleep(3000);
    if (resp && resp.status() === 404) {
      // Mungkin tertahan layar pemilih profil — selesaikan lalu ulangi.
      await page.goto("https://www.facebook.com/", {
        waitUntil: "domcontentloaded",
      });
      await sleep(2500);
      if (!(await clickContinue(page))) return false;
      const retry = await page.goto(SEARCH, {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      });
      await sleep(3000);
      return !!retry && retry.status() !== 404;
    }
    return !!resp && resp.status() < 400;
  } catch {
    return false;
  }
}

// Dipakai alur crawl.
async function isLoggedIn(ctx) {
  return await sessionActive(ctx);
}

// Login otomatis dengan FB_EMAIL/FB_PASSWORD. Dipakai HANYA sebagai cadangan
// saat sesi cookie mati. Kalau Facebook meminta 2FA atau checkpoint, skrip
// berhenti dan menyuruh login manual — bukan mencoba menembusnya.
async function tryAutoLogin(ctx) {
  if (!CFG.email || !CFG.password) return false;

  log("sesi mati — mencoba login otomatis (FB_EMAIL/FB_PASSWORD)");
  const page = ctx.pages()[0] || (await ctx.newPage());
  try {
    await page.goto("https://www.facebook.com/login", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.fill("input[name=email]", CFG.email);
    await page.fill("input[name=pass]", CFG.password);
    await page.click("button[name=login]");

    for (let i = 0; i < 20; i++) {
      await sleep(3000);
      if (await isLoggedIn(ctx)) {
        log("login otomatis berhasil, sesi tersimpan.");
        return true;
      }
      const url = page.url();
      if (/checkpoint|two_step_verification|login\/device-based/i.test(url)) {
        log("Facebook meminta verifikasi (checkpoint/2FA).");
        log("Jalankan: npm run login  -> selesaikan verifikasi di jendela browser.");
        return false;
      }
    }
    log("login otomatis gagal (timeout). Coba: npm run login");
    return false;
  } catch (e) {
    log("login otomatis error:", e.message);
    return false;
  }
}

async function cmdLogin() {
  log("membuka Chromium — login manual di jendela yang terbuka.");
  const ctx = await openContext({ headless: false });
  const page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto("https://www.facebook.com/login", {
    waitUntil: "domcontentloaded",
  });
  log("silakan login (sandi + 2FA milikmu sendiri). Menunggu...");

  for (let i = 0; i < 120; i++) {
    if (await hasCookie(ctx)) {
      // Cookie ada; pastikan sesinya benar-benar aktif — bukan sekadar layar
      // "Lanjutkan sebagai ...". Ini yang menentukan crawl bisa jalan.
      await clickContinue(page);
      if (await sessionActive(ctx)) {
        log("sesi AKTIF (pencarian bisa diakses), tersimpan di", CFG.profileDir);
        await sleep(1500);
        await ctx.close();
        return;
      }
      log("  cookie ada tapi sesi belum aktif — lanjutkan langkahnya di jendela browser");
    }
    await sleep(5000);
  }
  log("timeout 10 menit — login belum terdeteksi. Coba lagi.");
  await ctx.close();
  process.exitCode = 1;
}

// VPS tidak punya layar, jadi login manual tak bisa dilakukan di sana.
// Alurnya: login di PC -> --export-session -> salin fb-session.json ke VPS ->
// --import-session. Yang dipindah hanya cookie, bukan sandi.
const SESSION_FILE = path.resolve(HERE, process.env.FB_SESSION_FILE || "fb-session.json");

async function cmdExportSession() {
  const ctx = await openContext({ headless: CFG.headless });
  // Ambil cookie dari SEMUA domain Facebook (termasuk .facebook.com dan
  // messenger.com), bukan hanya www — sesi butuh datr/xs/sb sekaligus.
  const cookies = (await ctx.cookies()).filter((c) =>
    /facebook\.com|messenger\.com/i.test(c.domain || "")
  );
  await ctx.close();

  if (!cookies.some((c) => c.name === "c_user")) {
    log("sesi MATI — tidak ada yang bisa diekspor. Jalankan: npm run login");
    process.exitCode = 1;
    return;
  }
  fs.writeFileSync(SESSION_FILE, JSON.stringify(cookies, null, 2), "utf8");
  log("sesi diekspor ke", SESSION_FILE, `(${cookies.length} cookie)`);
  log("Salin berkas itu ke VPS, lalu jalankan di sana: npm run import-session");
  log("PERINGATAN: berkas ini setara akses akun. Jangan dibagikan/di-commit.");
}

async function cmdImportSession() {
  if (!fs.existsSync(SESSION_FILE)) {
    log("berkas tidak ada:", SESSION_FILE);
    log("Ekspor dulu di PC: npm run export-session");
    process.exitCode = 1;
    return;
  }
  const cookies = JSON.parse(fs.readFileSync(SESSION_FILE, "utf8"));
  const ctx = await openContext({ headless: CFG.headless });
  await ctx.addCookies(cookies);

  const page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded" });
  await sleep(3000);

  const ok = await isLoggedIn(ctx);
  await ctx.close();
  log(ok ? "sesi diimpor, login TERDETEKSI." : "impor gagal — cookie mungkin kedaluwarsa.");
  process.exitCode = ok ? 0 : 1;
}

async function cmdCheck() {
  const ctx = await openContext({ headless: CFG.headless });
  const ok = await isLoggedIn(ctx);
  log(ok ? "sesi HIDUP." : "sesi MATI — jalankan: npm run login");
  await ctx.close();
  process.exitCode = ok ? 0 : 1;
}

// ---------- ekstraksi ----------
// Selector Facebook diacak, jadi dipakai heuristik struktural: tiap kartu post
// adalah div[role="article"], permalink adalah anchor dengan pola khas post.
async function scrapeSearch(page, query) {
  const url =
    "https://www.facebook.com/search/posts/?q=" + encodeURIComponent(query);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(jitter(3000));

  for (let i = 0; i < CFG.maxScroll; i++) {
    await page.mouse.wheel(0, 2200);
    await sleep(jitter(CFG.delayMs));
  }

  return await page.evaluate((limit) => {
    const POST_RE =
      /(\/posts\/|\/permalink\/|\/videos\/|\/reel\/|story_fbid=|\/share\/p\/|\/photo\/?\?fbid=|\/groups\/[^/]+\/posts\/)/;
    // Facebook memakai innerText yang kosong pada kartu ber-content-visibility,
    // jadi teks dibaca lewat textContent.
    const clean = (s) => (s || "").replace(/\s+/g, " ").trim();

    // Kartu hasil pencarian tidak memakai role="article" dan anak div[role=feed]
    // hanyalah wadah kosong (virtualisasi). Penanda yang andal: tautan di dalam
    // kartu selalu membawa parameter pelacak __cft__. Dari situ naik ke leluhur
    // yang cukup tinggi -> itulah kartunya.
    const cards = [];
    const seenCard = new Set();
    for (const a of document.querySelectorAll('a[href*="__cft__"]')) {
      let el = a;
      for (let i = 0; i < 14 && el; i++) {
        const tinggi = el.getBoundingClientRect().height;
        const tautan = el.querySelectorAll('a[href*="__cft__"]').length;
        if (tinggi > 220 && tautan >= 2) {
          if (!seenCard.has(el)) {
            seenCard.add(el);
            cards.push(el);
          }
          break;
        }
        el = el.parentElement;
      }
    }

    const out = [];
    const seen = new Set();

    for (const art of cards.length ? cards : document.querySelectorAll('div[role="article"]')) {
      if (out.length >= limit) break;

      const anchors = Array.from(art.querySelectorAll("a[href]"));
      const permaEl = anchors.find((a) =>
        POST_RE.test(a.getAttribute("href") || "")
      );
      if (!permaEl) continue;

      let url = permaEl.href;
      try {
        const u = new URL(url);
        // buang parameter pelacak (__cft__, __tn__, ref, dll), sisakan yang
        // menentukan identitas post
        const keep = new URLSearchParams();
        for (const k of ["story_fbid", "id", "fbid", "set", "post_id", "multi_permalinks"]) {
          const v = u.searchParams.get(k);
          if (v) keep.set(k, v);
        }
        u.search = keep.toString();
        u.hash = "";
        url = u.toString();
      } catch {
        /* biarkan apa adanya */
      }
      if (seen.has(url)) continue;
      seen.add(url);

      // penulis: anchor ke profil/halaman. Anchor pertama yang cocok sering
      // membungkus foto profil (teksnya kosong), jadi cari yang BERTEKS dulu.
      const PROFIL_RE =
        /\/user\/\d+|profile\.php\?id=|^https?:\/\/(web|www)\.facebook\.com\/[A-Za-z0-9.]+(\?|\/?$)/;
      let account = "";
      let accountUrl = "";
      for (const a of anchors) {
        const href = a.getAttribute("href") || "";
        if (!PROFIL_RE.test(href) || POST_RE.test(href)) continue;
        if (!accountUrl) accountUrl = a.href;
        const t = clean(a.textContent);
        if (t) {
          account = t.slice(0, 120);
          accountUrl = a.href;
          break;
        }
      }
      if (!account) {
        // cadangan: judul kartu, mis. "Cerita sopir Truk · Ikuti"
        const kepala = art.querySelector("strong, h2, h3");
        account = clean(kepala && kepala.textContent)
          .replace(/\s*·\s*(Ikuti|Gabung|Follow|Join).*$/i, "")
          .slice(0, 120);
      }

      // waktu: Facebook menaruhnya di aria-label/title anchor permalink
      const published = clean(
        permaEl.getAttribute("aria-label") ||
          permaEl.getAttribute("title") ||
          permaEl.textContent
      ).slice(0, 60);

      // isi: teks kartu, dibersihkan dari label antarmuka. "Facebook" muncul
      // berulang karena teks alt gambar, sering menempel tanpa spasi.
      let content = clean(art.textContent)
        .replace(/(Facebook)+/gi, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
      if (account && content.startsWith(account)) {
        content = content.slice(account.length).trim();
      }
      // buang label antarmuka: kepala kartu (nama grup/akun + tombol Ikuti /
      // Gabung / "Dibagikan kepada ...") dan ekor tombol aksi.
      content = content
        .replace(/^.*?·\s*(Dibagikan kepada [^A-Z]{0,25})/i, "")
        .replace(/\s*·\s*(Ikuti|Gabung|Follow|Join)\b/gi, " ")
        .replace(/\b(Suka|Komentari|Bagikan|Kirim|Semua komentar|Lihat lainnya)\b.*$/i, "")
        .replace(/m\.me\S*/gi, " ")
        .replace(/^\s*(Grup publik|Publik|Anggota|Grup pribadi)\s*/i, "")
        .replace(/^[\s·•|]+/, "")
        .replace(/\s{2,}/g, " ")
        .trim()
        .slice(0, 800);

      // interaksi: aria-label berisi hitungan reaksi/komentar/bagikan
      const engagementText = clean(
        Array.from(art.querySelectorAll("[aria-label]"))
          .map((e) => e.getAttribute("aria-label"))
          .filter((l) => /reaksi|reaction|komentar|comment|bagikan|share|suka|like/i.test(l || ""))
          .filter((l) => /\d/.test(l))
          .slice(0, 4)
          .join(" - ")
      ).slice(0, 200);

      if (!content && !account) continue;
      out.push({ url, account, accountUrl, published, content, engagementText });
    }
    return out;
  }, CFG.perQuery);
}

// Buka satu post: ambil isi penuh + komentar teratas (yang paling banyak like
// biasanya yang memicu isu). Facebook mengurutkan "paling relevan" secara
// bawaan; di sini komentar diurutkan ulang berdasarkan jumlah like.
async function scrapePostDetail(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(jitter(3500));
  // Turun sedikit supaya komentar termuat.
  for (let i = 0; i < 2; i++) {
    await page.mouse.wheel(0, 1400);
    await sleep(jitter(2000));
  }

  return await page.evaluate((maxComments) => {
    // textContent, bukan innerText: kartu Facebook memakai content-visibility
    // sehingga innerText mengembalikan kosong.
    const clean = (s) =>
      (s || "").replace(/(Facebook)+/gi, " ").replace(/\s+/g, " ").trim();
    // "Budiono 23 jam yang lalu" -> "Budiono"
    const namaSaja = (s) =>
      clean(s)
        .replace(/\s*\d+\s*(detik|menit|jam|hari|minggu|bulan|tahun)\s*(yang lalu)?\s*$/i, "")
        .replace(/\s*(kemarin|hari ini)\s*$/i, "")
        .trim();

    // "1,2 rb" / "3.4K" -> angka
    const toNum = (s) => {
      const m = clean(s).toLowerCase().match(/([\d.,]+)\s*(rb|jt|k|m)?/);
      if (!m) return 0;
      const n = Number(m[1].replace(/\./g, "").replace(",", "."));
      if (Number.isNaN(n)) return 0;
      if (m[2] === "rb" || m[2] === "k") return Math.round(n * 1000);
      if (m[2] === "jt" || m[2] === "m") return Math.round(n * 1000000);
      return Math.round(n);
    };

    const arts = Array.from(document.querySelectorAll('div[role="article"]'));
    const isComment = (el) =>
      /^(comment by|komentar oleh)/i.test(el.getAttribute("aria-label") || "");

    // Kartu post = article yang BUKAN komentar, dengan teks terpanjang.
    let content = "";
    for (const el of arts) {
      if (isComment(el)) continue;
      let longest = "";
      for (const b of el.querySelectorAll('div[dir="auto"], div[data-ad-preview="message"]')) {
        const t = clean(b.textContent);
        if (t.length > longest.length) longest = t;
      }
      if (longest.length > content.length) content = longest;
    }
    // Cadangan: kalau struktur article tidak ketemu, ambil teks utama halaman.
    if (!content) {
      const main = document.querySelector('div[role="main"]');
      content = clean(main && main.textContent).slice(0, 4000);
    }
    content = content.slice(0, 4000);

    // Facebook tidak punya judul. Judul diturunkan dari baris/kalimat pertama.
    const firstLine = content.split(/\n|(?<=[.!?])\s+/)[0] || content;
    const title = clean(firstLine).slice(0, 120);

    const comments = [];
    for (const el of arts) {
      if (!isComment(el)) continue;
      if (comments.length >= maxComments * 3) break;

      const label = el.getAttribute("aria-label") || "";
      const author = namaSaja(label.replace(/^(comment by|komentar oleh)\s*/i, "")).slice(0, 120);

      let text = "";
      for (const b of el.querySelectorAll('div[dir="auto"]')) {
        const t = clean(b.textContent);
        if (t.length > text.length) text = t;
      }
      if (!text) continue;

      // Jumlah like komentar: aria-label yang memuat kata reaksi/suka.
      let likes = 0;
      for (const n of el.querySelectorAll("[aria-label]")) {
        const l = n.getAttribute("aria-label") || "";
        if (/reaksi|reaction|suka|like/i.test(l) && /\d/.test(l)) {
          likes = Math.max(likes, toNum(l));
        }
      }
      // Cadangan: angka telanjang di dekat tombol Balas.
      if (!likes) {
        for (const n of el.querySelectorAll("span")) {
          const t = clean(n.textContent);
          if (/^\d[\d.,]*\s*(rb|jt|k|m)?$/i.test(t)) likes = Math.max(likes, toNum(t));
        }
      }

      const url =
        (Array.from(el.querySelectorAll("a[href]")).find((a) =>
          /comment_id=/.test(a.getAttribute("href") || "")
        ) || {}).href || "";

      comments.push({ author, text: text.slice(0, 600), likes, url });
    }

    // Paling banyak like di atas — itu yang biasanya memicu isu.
    comments.sort((a, b) => b.likes - a.likes);

    return { title, content, comments: comments.slice(0, maxComments) };
  }, CFG.commentsPerPost);
}

// ---------- pengiriman ----------
async function sendToApp(query, posts) {
  if (!posts.length) return;
  const body = JSON.stringify({ query, posts, collectedAt: Date.now() });

  if (CFG.token) {
    try {
      const res = await fetch(CFG.appUrl + "/api/fb/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-worker-token": CFG.token,
        },
        body,
      });
      if (res.ok) {
        const j = await res.json().catch(() => ({}));
        log("  -> terkirim ke app (" + (j.saved ?? posts.length) + " post)");
        return;
      }
      const errText = (await res.text()).slice(0, 120);
      log("  -> app menolak: HTTP " + res.status + " " + errText);
    } catch (e) {
      log("  -> gagal kirim ke app:", e.message);
    }
  } else {
    log("  -> FB_WORKER_TOKEN kosong, simpan ke berkas saja");
  }

  // cadangan: tulis ke data/fb-inbox.json supaya hasil tidak hilang
  const file = path.join(ROOT, "data", "fb-inbox.json");
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const prev = fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file, "utf8"))
      : [];
    prev.push({ query, posts, collectedAt: Date.now() });
    fs.writeFileSync(file, JSON.stringify(prev, null, 2), "utf8");
    log("  -> disimpan ke", file);
  } catch (e) {
    log("  -> gagal menyimpan berkas:", e.message);
  }
}

// ---------- putaran utama ----------
async function cmdCrawl() {
  const queries = buildQueries();
  if (!queries.length) {
    log('tidak ada kueri. Isi data/targets.json, FB_QUERIES, atau pakai --q "kata kunci"');
    return;
  }

  const ctx = await openContext({ headless: CFG.headless });
  if (!(await isLoggedIn(ctx)) && !(await tryAutoLogin(ctx))) {
    log("sesi MATI. Jalankan dulu: npm run login");
    await ctx.close();
    process.exitCode = 1;
    return;
  }

  const page = ctx.pages()[0] || (await ctx.newPage());
  log("menyisir " + queries.length + " kueri (Page & grup publik)");

  for (const q of queries) {
    try {
      log('kueri: "' + q + '"');
      const posts = await scrapeSearch(page, q);
      log("  dapat " + posts.length + " post");

      // Perdalam sebagian post: isi penuh + komentar teratas. Yang lain tetap
      // dikirim apa adanya dari hasil pencarian.
      if (CFG.withComments && posts.length) {
        const deep = posts.slice(0, CFG.detailPerQuery);
        for (const p of deep) {
          try {
            const d = await scrapePostDetail(page, p.url);
            p.title = d.title;
            if (d.content && d.content.length > (p.content || "").length) {
              p.content = d.content;
            }
            p.comments = d.comments;
            log("    + " + d.comments.length + " komentar: " + p.title.slice(0, 60));
          } catch (e) {
            log("    ! gagal buka post: " + e.message);
          }
          await sleep(jitter(CFG.delayMs));
        }
      }

      await sendToApp(q, posts);
    } catch (e) {
      log("  gagal: " + e.message);
    }
    // jeda antar kueri: jangan menghajar server, perkecil risiko checkpoint
    await sleep(jitter(CFG.delayMs * 2));
  }

  await ctx.close();
  log("selesai.");
}

async function main() {
  if (has("--login")) return cmdLogin();
  if (has("--check")) return cmdCheck();
  if (has("--export-session")) return cmdExportSession();
  if (has("--import-session")) return cmdImportSession();
  if (has("--loop")) {
    for (;;) {
      await cmdCrawl();
      log("tidur " + CFG.loopMinutes + " menit...");
      await sleep(CFG.loopMinutes * 60 * 1000);
    }
  }
  return cmdCrawl();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
