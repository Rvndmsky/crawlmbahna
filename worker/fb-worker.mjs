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
  loopMinutes: Number(process.env.FB_LOOP_MINUTES) || 60,
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

  const names = readTargets();
  if (!names.length) return CFG.keywords.slice(0, CFG.maxQueries);

  const out = [];
  for (const n of names) {
    out.push(n);
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

async function isLoggedIn(ctx) {
  const cookies = await ctx.cookies("https://www.facebook.com");
  return cookies.some((c) => c.name === "c_user" && c.value);
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
    if (await isLoggedIn(ctx)) {
      log("sesi tersimpan di", CFG.profileDir);
      await sleep(1500);
      await ctx.close();
      return;
    }
    await sleep(5000);
  }
  log("timeout 10 menit — login belum terdeteksi. Coba lagi.");
  await ctx.close();
  process.exitCode = 1;
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
      /(\/posts\/|\/permalink\/|\/videos\/|story_fbid=|\/share\/p\/|\/groups\/[^/]+\/posts\/)/;
    const clean = (s) => (s || "").replace(/\s+/g, " ").trim();

    const out = [];
    const seen = new Set();

    for (const art of document.querySelectorAll('div[role="article"]')) {
      if (out.length >= limit) break;

      const anchors = Array.from(art.querySelectorAll("a[href]"));
      const permaEl = anchors.find((a) =>
        POST_RE.test(a.getAttribute("href") || "")
      );
      if (!permaEl) continue;

      let url = permaEl.href;
      try {
        const u = new URL(url);
        // buang parameter pelacak, sisakan yang menentukan identitas post
        const keep = new URLSearchParams();
        for (const k of ["story_fbid", "id", "fbid"]) {
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

      // penulis: anchor ke profil/page, bukan permalink post
      const authorEl =
        art.querySelector("h3 a[href], h2 a[href], strong a[href]") ||
        anchors.find(
          (a) =>
            !POST_RE.test(a.getAttribute("href") || "") && clean(a.innerText)
        );
      const account = clean(authorEl && authorEl.innerText).slice(0, 120);
      const accountUrl = (authorEl && authorEl.href) || "";

      // waktu: Facebook menaruhnya di aria-label/title anchor permalink
      const published = clean(
        permaEl.getAttribute("aria-label") ||
          permaEl.getAttribute("title") ||
          permaEl.innerText
      ).slice(0, 60);

      // isi: blok teks terpanjang di dalam kartu
      let content = "";
      const blocks = art.querySelectorAll(
        'div[dir="auto"], div[data-ad-preview="message"]'
      );
      for (const b of blocks) {
        const t = clean(b.innerText);
        if (t.length > content.length) content = t;
      }
      content = content.slice(0, 600);

      // interaksi: aria-label yang memuat hitungan reaksi/komentar/bagikan
      const engagementText = clean(
        Array.from(art.querySelectorAll("[aria-label]"))
          .map((e) => e.getAttribute("aria-label"))
          .filter((l) => /reaksi|reaction|komentar|comment|bagikan|share/i.test(l || ""))
          .join(" - ")
      ).slice(0, 200);

      if (!content && !account) continue;
      out.push({ url, account, accountUrl, published, content, engagementText });
    }
    return out;
  }, CFG.perQuery);
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
