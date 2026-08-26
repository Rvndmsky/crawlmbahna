# Worker Facebook — crawl isu demo (Page & grup publik)

Worker Chromium yang berjalan **di komputer/VPS-mu**, bukan di Vercel.

## Kenapa harus terpisah

Website di Vercel tidak bisa menjalankan ini: serverless punya filesystem
read-only, mati tiap selesai request, dan batas 60 detik. Sesi login Facebook
butuh browser yang hidup terus + folder profil yang bisa ditulis. Jadi alur
kerjanya:

```
[PC/VPS] worker Chromium  --POST /api/fb/ingest-->  [website]  -->  /gettargetmbahna
```

## Pasang

```bash
cd worker
npm install
npx playwright install chromium
cp .env.example .env      # lalu isi APP_URL & FB_WORKER_TOKEN
```

Windows PowerShell: `copy .env.example .env`

Token harus **sama persis** dengan `FB_WORKER_TOKEN` di server. Kalau server
belum punya ENV itu, endpoint ingest tertutup dan worker cuma menulis hasil ke
`../data/fb-inbox.json`.

Node 20+ membaca `.env` lewat flag; paling gampang set variabel di shell:

```powershell
$env:APP_URL = "http://localhost:3000"
$env:FB_WORKER_TOKEN = "token-yang-sama-dengan-server"
```

## Pakai

```bash
npm run login    # sekali saja: jendela browser terbuka, kamu login sendiri
npm run check    # cek sesi masih hidup
npm run crawl    # sisir sekali
npm run watch    # sisir terus tiap FB_LOOP_MINUTES (default 60 menit)
```

### Dua cara login

| Cara | Isi `.env` | Sifat |
|---|---|---|
| Manual (disarankan) | kosongkan `FB_EMAIL`/`FB_PASSWORD` | `npm run login` sekali, cookie sesi dipakai berbulan-bulan. Sandi tidak tersimpan. Aman dari deteksi. |
| Otomatis | isi `FB_EMAIL` + `FB_PASSWORD` | Dipakai hanya saat sesi cookie mati. Sandi plaintext di disk. Sering kena checkpoint; 2FA tidak bisa dilewati. |

Cara otomatis bukan pengganti cara manual: kalau Facebook meminta verifikasi,
worker berhenti dan menyuruh `npm run login`. Jangan pakai akun utama.

`npm run login` membuka Chromium biasa. Sandi dan 2FA kamu ketik sendiri di
jendela itu — skrip tidak pernah menyimpan sandi. Yang tersimpan hanya cookie
sesi di folder `worker/fb-profile/` (sudah di-gitignore).

## Jalan 24 jam di VPS

Login manual butuh layar, sedangkan VPS tidak punya. Alurnya: login di PC,
ekspor cookie-nya, pindahkan ke VPS.

```bash
# di PC
npm run login
npm run export-session          # menghasilkan fb-session.json
scp fb-session.json root@IP-VPS:/opt/crawlmbahna/worker/

# di VPS
npm run import-session
```

`fb-session.json` setara akses akun — jangan dibagikan, hapus setelah dipakai
(sudah di-gitignore). Panduan lengkap termasuk systemd: [DEPLOY-VPS.md](DEPLOY-VPS.md).

## Kueri disusun dari mana

Urutan prioritas:

1. `--q "kata kunci"` di baris perintah (boleh diulang)
2. ENV `FB_QUERIES` (pisah koma)
3. `data/targets.json` milik aplikasi × `FB_KEYWORDS`
   → mis. target "Budi" menghasilkan `Budi`, `Budi demo`, `Budi unjuk rasa`, …

Contoh sekali jalan tanpa daftar target:

```bash
node fb-worker.mjs --q "demo BBM Jakarta" --q "aksi buruh Bekasi"
```

## Isi penuh + komentar

Hasil pencarian Facebook cuma memuat cuplikan. Supaya dapat isi utuh dan
komentar, worker membuka sebagian post satu per satu:

- `FB_DETAIL_PER_QUERY` (default 5) — berapa post per kueri yang dibuka.
- `FB_COMMENTS_PER_POST` (default 8) — komentar teratas yang diambil, diurutkan
  dari like terbanyak (itu yang biasanya memicu isu).
- `FB_FETCH_COMMENTS=false` — matikan kalau mau cepat; hanya cuplikan pencarian.

Judul tidak ada di Facebook, jadi diturunkan dari kalimat pertama isi post.

## Batas yang dipaksakan

- Hanya **Page publik, grup publik, dan hasil pencarian publik**. Postingan
  teman-saja dan grup tertutup tidak diambil.
- Endpoint ingest menolak URL di luar domain facebook.com.
- Jeda acak antar kueri untuk memperkecil risiko rate limit.

## Risiko yang harus kamu tahu

Otomasi akun melanggar Ketentuan Layanan Facebook. Akun bisa kena checkpoint
atau ban permanen. **Pakai akun sekunder**, jangan akun utama. Turunkan
`FB_MAX_QUERIES` dan naikkan `FB_DELAY_MS` kalau mulai sering kena verifikasi.

## Catatan produksi

Di Vercel, hasil ingest ditulis ke `/tmp` yang bersifat ephemeral dan
per-instance — data bisa hilang atau tidak terbaca instance lain. Untuk pemakaian
serius, ganti penyimpanan di `src/lib/fbstore.ts` ke Vercel KV / Postgres /
Upstash Redis. Kalau website dijalankan lokal (`npm run dev`), berkas
`data/fb-posts.json` persisten dan tidak ada masalah ini.
