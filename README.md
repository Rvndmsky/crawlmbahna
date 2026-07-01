# mbahna — mesin pencari berita intelijen (OSINT)

UI ala Google: satu kotak pencarian. Ketik topik (mis. `koperasi merah putih 2026`),
sistem menyisir web berita + media sosial yang terindeks publik lalu menampilkan
daftar berita: judul, sumber, platform, tanggal, ringkasan (Bahasa Indonesia),
dan sentimen.

Mesinnya: **Claude (Anthropic) + tool `web_search` / `web_fetch`**. Hasil di-cache
di SQLite lokal.

## Stack
- Next.js 15 (App Router) + React 19 + TypeScript
- better-sqlite3 (cache hasil)
- @anthropic-ai/sdk (web search + ringkas + sentimen)

## Setup

```bash
cd D:\RvnCoba2\mbahna
npm install
copy .env.local.example .env.local   # lalu isi ANTHROPIC_API_KEY
npm run dev
```

Buka http://localhost:3000

## Konfigurasi (.env.local)
- `ANTHROPIC_API_KEY` — wajib.
- `ANTHROPIC_MODEL` — default `claude-opus-4-8`. Untuk lebih murah: `claude-sonnet-5`.
- `SEARCH_CACHE_MINUTES` — default 180. Query sama dalam rentang ini pakai cache.

## Catatan cakupan "semua sosial media"
Pencarian menjangkau konten **terindeks publik** (situs berita, post X/Twitter,
YouTube, blog, forum). Pencarian **dalam-platform** (feed privat/algoritmik
Instagram, Facebook, TikTok) butuh API resmi tiap platform — bisa ditambah sebagai
konektor terpisah:
- X/Twitter API v2
- YouTube Data API
- Telegram (MTProto, channel publik)
- Meta Graph API (butuh app review)

Tiap konektor tinggal mengembalikan `NewsItem[]` (lihat `src/lib/search.ts`) lalu
digabung ke hasil web search.

## Struktur
```
src/
  lib/
    db.ts          # SQLite: cache searches + results
    anthropic.ts   # klien + model
    search.ts      # inti: web_search agentic loop -> JSON terstruktur
  app/
    page.tsx           # home (search bar)
    search/page.tsx    # halaman hasil
    api/search/route.ts
```

## Deploy ke Vercel

1. Push repo ini ke GitHub.
2. Di Vercel: **New Project** → import repo → framework auto-detect **Next.js** → Deploy.
3. **Settings → Environment Variables**, tambah:

| Key | Value | Catatan |
|---|---|---|
| `AUTH_SECRET` | string acak panjang | WAJIB — pengaman token login |
| `OPENROUTER_API_KEY` | `sk-or-...` | key OpenRouter |
| `AI_PROVIDER` | `openai` | pakai OpenRouter/OpenAI-compatible |
| `OPENAI_BASE_URL` | `https://openrouter.ai/api/v1` | |
| `AI_MODEL` | `perplexity/sonar` | ⚠️ pakai model CEPAT (Vercel batas 60 dtk) |
| `AUTH_EMAIL` | `pejaten@mbahrazu.com` | opsional (override default) |
| `AUTH_PASSWORD` | `pejatenkeren` | opsional (override default) |

4. **Redeploy** setelah env di-set.

Catatan serverless:
- Filesystem read-only → auth stateless (JWT), settings dibaca dari **ENV** (halaman ⚙ Setup
  tidak persist di Vercel), cache non-persist (ephemeral).
- **Model harus cepat** (`perplexity/sonar` / `gpt-4o-mini`). Model reasoning berat (deepseek-v4-pro
  ~80 dtk) akan timeout di Vercel Hobby (batas 60 dtk).

## Legal / etika
Alat OSINT untuk sumber terbuka. Patuhi ToS tiap platform & hukum yang berlaku;
jangan dipakai untuk pelanggaran privasi / penargetan individu tanpa dasar sah.
