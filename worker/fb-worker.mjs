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
  // Hanya postingan baru yang dipantau. Post yang waktunya tidak terbaca tetap
  // dikirim (biar tidak ada yang hilang diam-diam) dan ditandai di aplikasi.
  maxAgeDays: Number(process.env.FB_MAX_AGE_DAYS) || 3,
  // Tangkapan layar postingan, disimpan sebagai JPEG base64.
  withShots: process.env.FB_SCREENSHOT !== "false",
  // Filter "Postingan Terbaru" bawaan Facebook. Kadang membuat hasil kosong,
  // jadi bisa dimatikan.
  recentFilter: process.env.FB_RECENT_FILTER === "true",
  loopMinutes: Number(process.env.FB_LOOP_MINUTES) || 60,
  // Berapa akun yang dibaca jumlah pengikutnya per putaran.
  maksAkun: Number(process.env.AKUN_PER_PUTARAN) || 12,
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

// Pembaca waktu Facebook ("3 j", "2 hari yang lalu", "Kemarin", "12 Agustus").
// Kembarannya di sisi aplikasi: src/lib/fbtime.ts.
const SATUAN_MS = {
  dtk: 1e3, detik: 1e3, s: 1e3,
  mnt: 6e4, menit: 6e4, m: 6e4, min: 6e4,
  j: 36e5, jam: 36e5, h: 36e5, hour: 36e5, hours: 36e5,
  hr: 864e5, hari: 864e5, d: 864e5, day: 864e5, days: 864e5,
  mgg: 6048e5, minggu: 6048e5, w: 6048e5, week: 6048e5, weeks: 6048e5,
  bln: 2592e6, bulan: 2592e6, month: 2592e6, months: 2592e6,
  thn: 31536e6, tahun: 31536e6, y: 31536e6, year: 31536e6,
};
const BULAN = {
  januari: 0, februari: 1, maret: 2, april: 3, mei: 4, juni: 5, juli: 6,
  agustus: 7, september: 8, oktober: 9, november: 10, desember: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, agu: 7, agt: 7,
  sep: 8, okt: 9, nov: 10, des: 11,
};

function parseFbTime(raw, now = Date.now()) {
  const t = (raw || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!t) return 0;
  if (/baru saja|just now|beberapa detik/.test(t)) return now;
  if (/kemarin|yesterday/.test(t)) return now - 864e5;

  const rel = t.match(
    /(\d+)\s*(dtk|detik|mnt|menit|jam|hari|mgg|minggu|bln|bulan|thn|tahun|s|m|j|h|d|w|y|min|hour|hours|day|days|week|weeks|month|months|year|years)\b/
  );
  if (rel && SATUAN_MS[rel[2]]) return now - Number(rel[1]) * SATUAN_MS[rel[2]];

  const tgl = t.match(/(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?/);
  if (tgl && BULAN[tgl[2]] !== undefined) {
    const nowD = new Date(now);
    const tahun = tgl[3] ? Number(tgl[3]) : nowD.getFullYear();
    const d = new Date(tahun, BULAN[tgl[2]], Number(tgl[1]), 12, 0, 0);
    if (!tgl[3] && d.getTime() > now + 864e5) d.setFullYear(tahun - 1);
    return d.getTime();
  }
  return 0;
}

// true = terlalu lama. Waktu tak terbaca dianggap masih layak (0 = tak tahu).
function terlaluLama(published) {
  const ms = parseFbTime(published);
  if (!ms) return false;
  return (Date.now() - ms) / 864e5 > CFG.maxAgeDays;
}

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
// Hasil pencarian Facebook tidak urut waktu — bawaannya "paling relevan",
// sering berisi post berminggu-minggu lalu. Filter "Postingan Terbaru"
// dikirim lewat parameter filters (JSON yang di-base64-kan).
const FILTER_TERBARU = Buffer.from(
  JSON.stringify({
    "recent_posts:0": JSON.stringify({ name: "recent_posts", args: "" }),
  })
).toString("base64");

async function scrapeSearch(page, query) {
  const url =
    "https://www.facebook.com/search/posts/?q=" +
    encodeURIComponent(query) +
    (CFG.recentFilter ? "&filters=" + encodeURIComponent(FILTER_TERBARU) : "");
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(jitter(3000));

  for (let i = 0; i < CFG.maxScroll; i++) {
    await page.mouse.wheel(0, 2200);
    await sleep(jitter(CFG.delayMs));
  }

  const hasil = await page.evaluate((limit) => {
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

        // Post grup muncul sebagai tautan /photo/?fbid=..&set=gm.<idPost>
        // &idorvanity=<idGrup>. Itu membuka penampil foto (dengan panel
        // komentar), bukan postingannya. Susun ulang jadi URL post asli.
        const set = u.searchParams.get("set") || "";
        const grup = u.searchParams.get("idorvanity") || "";
        const gm = set.match(/^gm\.(\d+)$/);
        if (gm && grup) {
          url = `https://www.facebook.com/groups/${grup}/posts/${gm[1]}/`;
        } else {
          // buang parameter pelacak (__cft__, __tn__, ref, dll), sisakan yang
          // menentukan identitas post
          const keep = new URLSearchParams();
          for (const k of ["story_fbid", "id", "fbid", "post_id", "multi_permalinks"]) {
            const v = u.searchParams.get(k);
            if (v) keep.set(k, v);
          }
          u.search = keep.toString();
          u.hash = "";
          url = u.toString();
        }
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

      // waktu: cari teks pendek berpola waktu di dalam kartu. Untuk post grup,
      // anchor permalink berbentuk /photo/ dan tidak memuat label waktu.
      // Nama bulan harus disebut eksplisit; pola bebas membuat teks seperti
      // "1 Obrolan yang Belum Dibaca" ikut terbaca sebagai tanggal.
      const TIME_RE =
        /^(baru saja|kemarin|hari ini|\d+\s*(dtk|detik|mnt|menit|j|jam|h|hari|mgg|minggu|bln|bulan|thn|tahun)( yang lalu)?$|\d{1,2}\s+(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember|jan|feb|mar|apr|jun|jul|agu|agt|sep|okt|nov|des)\b)/i;
      let published = clean(
        permaEl.getAttribute("aria-label") || permaEl.getAttribute("title") || ""
      );
      if (!TIME_RE.test(published)) {
        published = "";
        for (const el of art.querySelectorAll("a, span, abbr")) {
          const t = clean(el.textContent);
          if (t.length <= 40 && TIME_RE.test(t)) {
            published = t;
            break;
          }
        }
      }
      published = published.slice(0, 60);

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
      // Tandai kartunya supaya bisa dipotret dari luar evaluate. Kartu di
      // halaman pencarian adalah postingan si pembuat — tanpa panel komentar.
      art.setAttribute("data-mbahna", String(out.length));
      out.push({
        url,
        account,
        accountUrl,
        published,
        content,
        engagementText,
        cardIdx: out.length,
      });
    }
    return out;
  }, CFG.perQuery);

  // Potret kartu postingan langsung dari halaman hasil pencarian: yang tampil
  // di situ adalah post si pembuat (foto, teks, jumlah reaksi) tanpa komentar.
  if (CFG.withShots) {
    for (const p of hasil.slice(0, CFG.detailPerQuery)) {
      try {
        const kartu = page.locator(`[data-mbahna="${p.cardIdx}"]`).first();
        await kartu.scrollIntoViewIfNeeded({ timeout: 8000 });
        await sleep(900);
        const buf = await kartu.screenshot({
          type: "jpeg",
          quality: 65,
          timeout: 15000,
        });
        const b64 = buf.toString("base64");
        if (b64.length <= 400000) p.shot = b64;
      } catch {
        /* kartu bergeser saat digulir -> lewati fotonya */
      }
    }
  }
  return hasil;
}

// Buka satu post: ambil isi penuh + komentar teratas (yang paling banyak like
// biasanya yang memicu isu). Facebook mengurutkan "paling relevan" secara
// bawaan; di sini komentar diurutkan ulang berdasarkan jumlah like.
async function scrapePostDetail(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(jitter(3500));

  // URL /photo/ membuka penampil foto (foto besar + panel komentar), bukan
  // postingannya. Facebook menautkan postingan aslinya di situ ("Foto ini dari
  // sebuah postingan. Lihat postingan") — pindah ke sana supaya yang terbaca
  // dan terpotret adalah kartu post si pembuat.
  if (/\/photo\/?\?|\/photo\.php/.test(page.url())) {
    const tujuan = await page.evaluate(() => {
      const POST_RE = /(\/posts\/|\/permalink\/|story_fbid=|\/share\/p\/|\/groups\/[^/]+\/posts\/)/;
      for (const a of document.querySelectorAll("a[href]")) {
        const href = a.getAttribute("href") || "";
        if (POST_RE.test(href)) return a.href;
      }
      return "";
    });
    if (tujuan) {
      try {
        await page.goto(tujuan, { waitUntil: "domcontentloaded", timeout: 45000 });
        await sleep(jitter(3000));
      } catch {
        /* gagal pindah -> tetap pakai halaman foto */
      }
    }
  }
  // Turun sedikit supaya komentar termuat.
  for (let i = 0; i < 2; i++) {
    await page.mouse.wheel(0, 1400);
    await sleep(jitter(2000));
  }

  const data = await page.evaluate((maxComments) => {
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

    // Waktu terbit: di halaman post, tanggal tertulis jelas ("18 Agustus pada
    // 13.15"). Ini lebih tepercaya daripada kartu hasil pencarian.
    const TIME_RE =
      /^(baru saja|kemarin|hari ini|\d+\s*(dtk|detik|mnt|menit|j|jam|h|hari|mgg|minggu|bln|bulan|thn|tahun)( yang lalu)?$|\d{1,2}\s+(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember|jan|feb|mar|apr|jun|jul|agu|agt|sep|okt|nov|des)\b)/i;
    // Cari HANYA di dalam kartu post; kalau menyapu seluruh halaman, yang
    // terbaca sering waktu komentar ("1 menit").
    let kartuPost = null;
    let atas = Infinity;
    for (const el of arts) {
      if (isComment(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.height < 200) continue;
      const y = r.top + window.scrollY;
      if (y < atas) {
        atas = y;
        kartuPost = el;
      }
    }
    const ruang = kartuPost || document;
    let published = "";
    for (const el of ruang.querySelectorAll("a[aria-label], a, span, abbr")) {
      const kandidat = clean(el.getAttribute("aria-label") || el.textContent);
      if (kandidat.length <= 45 && TIME_RE.test(kandidat)) {
        published = kandidat;
        break;
      }
    }

    return { title, content, published, comments: comments.slice(0, maxComments) };
  }, CFG.commentsPerPost);

  return data;
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


// ---------- jumlah pengikut akun media sosial ----------
// Dibaca TANPA login: Instagram, Threads, TikTok, dan YouTube menampilkan
// jumlah pengikut kepada pengunjung anonim. X/Twitter membalas 403 tanpa sesi,
// jadi platform itu dilewati dengan sendirinya.
const POLA_PENGIKUT =
  /([\d.,]+\s*(?:rb|jt|k|m|b|ribu|juta)?)\s*(pengikut|followers?|subscribers?)/i;

async function bacaPengikut(browser, url) {
  const ctx = await browser.newContext({
    locale: "id-ID",
    timezoneId: "Asia/Jakarta",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/140.0 Safari/537.36",
  });
  try {
    const page = await ctx.newPage();
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    if (resp && resp.status() >= 400) return "";
    await sleep(jitter(4000));

    const teks = await page.evaluate(() =>
      (document.body.innerText || "").replace(/\s+/g, " ").slice(0, 4000)
    );
    const m = POLA_PENGIKUT.exec(teks);
    return m ? m[1].trim() : "";
  } catch {
    return "";
  } finally {
    await ctx.close().catch(() => {});
  }
}

async function cmdAkun() {
  if (!CFG.token) {
    log("FB_WORKER_TOKEN kosong — tidak bisa mengambil antrian akun.");
    return;
  }

  let daftar = [];
  try {
    const res = await fetch(CFG.appUrl + "/api/social/akun", {
      headers: { "x-worker-token": CFG.token },
    });
    if (!res.ok) {
      log("antrian akun ditolak: HTTP " + res.status);
      return;
    }
    daftar = (await res.json()).urls || [];
  } catch (e) {
    log("gagal mengambil antrian akun:", e.message);
    return;
  }

  if (!daftar.length) {
    log("antrian akun kosong.");
    return;
  }

  log("membaca pengikut " + daftar.length + " akun (tanpa login)");
  const browser = await chromium.launch({ headless: CFG.headless });
  const hasil = [];
  for (const url of daftar.slice(0, CFG.maksAkun)) {
    const followers = await bacaPengikut(browser, url);
    log("  " + (followers || "tidak terbaca") + "  <-  " + url.slice(0, 70));
    if (followers) hasil.push({ url, followers });
    await sleep(jitter(2500));
  }
  await browser.close();

  if (!hasil.length) {
    log("tidak ada angka yang terbaca.");
    return;
  }
  try {
    const res = await fetch(CFG.appUrl + "/api/social/akun", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-worker-token": CFG.token },
      body: JSON.stringify({ hasil }),
    });
    const j = await res.json().catch(() => ({}));
    log(res.ok ? "  -> tersimpan " + (j.tersimpan ?? hasil.length) + " akun"
                : "  -> ditolak app: HTTP " + res.status);
  } catch (e) {
    log("gagal mengirim hasil akun:", e.message);
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
      const mentah = await scrapeSearch(page, q);
      // Saring umur di sini supaya post lama tidak ikut dibuka satu per satu.
      const posts = mentah.filter((p) => !terlaluLama(p.published));
      const buang = mentah.filter((p) => terlaluLama(p.published));
      log(
        "  dapat " + posts.length + " post" +
          (buang.length
            ? ` (${buang.length} dibuang >${CFG.maxAgeDays} hari: ` +
              buang.slice(0, 4).map((p) => p.published || "?").join(" | ") + ")"
            : "")
      );

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
            // Waktu dari halaman post lebih tepercaya; pakai itu bila ada.
            if (d.published) p.published = d.published;
            if (terlaluLama(p.published)) {
              p.buang = true;
              log("    - dibuang, lebih dari " + CFG.maxAgeDays + " hari: " + p.published);
              continue;
            }
            log(
              "    + " + d.comments.length + " komentar" +
                (p.shot ? ", foto " + Math.round(p.shot.length / 1365) + " KB" : "") +
                ": " + p.title.slice(0, 50)
            );
          } catch (e) {
            log("    ! gagal buka post: " + e.message);
          }
          await sleep(jitter(CFG.delayMs));
        }
      }

      await sendToApp(q, posts.filter((p) => !p.buang));
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
  if (has("--akun")) return cmdAkun();
  if (has("--login")) return cmdLogin();
  if (has("--check")) return cmdCheck();
  if (has("--export-session")) return cmdExportSession();
  if (has("--import-session")) return cmdImportSession();
  if (has("--loop")) {
    for (;;) {
      await cmdCrawl();
      // Sekalian layani antrian jumlah pengikut; tidak butuh sesi Facebook.
      await cmdAkun().catch((e) => log("akun gagal:", e.message));
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
