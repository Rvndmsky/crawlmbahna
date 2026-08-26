# Menjalankan worker Facebook di VPS

Tujuan: worker menyisir 24 jam tanpa PC-mu harus menyala. Hasilnya masuk ke
Upstash Redis, lalu bisa dibuka dari mana saja lewat situs di Vercel.

## Yang kamu perlukan

| Kebutuhan | Rincian |
|---|---|
| VPS Linux | **Ubuntu 22.04 / 24.04, x86_64**. Bukan ARM (Playwright Chromium resminya x86_64). |
| RAM | **minimal 2 GB** (Chromium haus memori). 1 GB bisa, tapi harus tambah swap. |
| Disk | 10 GB cukup (Chromium ±400 MB). |
| Akses | SSH sebagai root atau user dengan sudo. |
| Akun Facebook | akun **sekunder**, bukan akun utama. |
| Upstash Redis | sudah di-set di Vercel (`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`). |
| PC sendiri | dipakai sekali untuk login Facebook, lalu sesinya dipindah ke VPS. |

Penyedia yang lazim dipakai di Indonesia: Biznet Gio, IDCloudHost, Contabo,
DigitalOcean, Hetzner. Paket 2 GB RAM biasanya Rp 50.000–120.000/bulan.

## 0. Khusus Biznet Gio (NEO Virtual Compute)

Di panel **portal.biznetgio.com** → NEO Virtual Compute → **Create Instance**:

| Isian | Pilih |
|---|---|
| Region | Jakarta / Cikarang (mana saja) |
| OS Image | **Ubuntu 22.04 LTS** atau 24.04 LTS |
| Size | minimal **2 vCPU / 2 GB RAM** |
| Storage | 20 GB (paket dasar sudah cukup) |
| SSH Key | pilih key kalau punya; kalau tidak, catat password root yang diberikan |
| Network | pastikan instance dapat **Public IP / Floating IP** |

Setelah instance menyala, catat IP publiknya.

**Firewall / Security Group**: worker hanya butuh koneksi KELUAR (ke Facebook,
Vercel, Upstash). Tidak ada layanan yang perlu dibuka dari luar. Cukup izinkan
**inbound TCP 22 (SSH)**, sisanya biarkan tertutup.

**Masuk dari Windows** (PowerShell biasa, OpenSSH sudah bawaan Windows 11):

```powershell
ssh root@IP-PUBLIK-VPS
```

Kalau image Biznet memakai user non-root, biasanya `ubuntu`:

```powershell
ssh ubuntu@IP-PUBLIK-VPS
sudo -i                      # naik ke root
```

Sisa langkah di bawah dijalankan sebagai root.

## 1. Siapkan VPS

```bash
ssh root@IP-VPS

apt update && apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs git
node -v          # pastikan v22.x
```

## 2. Ambil kode & pasang Chromium

```bash
cd /opt
git clone https://github.com/Rvndmsky/crawlmbahna.git
cd crawlmbahna/worker

npm install
npx playwright install --with-deps chromium   # --with-deps memasang pustaka sistem
```

## 3. Isi konfigurasi

```bash
nano /opt/crawlmbahna/worker/.env
```

```
APP_URL=https://pejatenkeren.vercel.app
FB_WORKER_TOKEN=token-yang-sama-dengan-di-vercel

FB_KEYWORDS=demo,unjuk rasa,aksi massa
FB_QUERIES=

FB_FETCH_COMMENTS=true
FB_DETAIL_PER_QUERY=5
FB_COMMENTS_PER_POST=8

FB_HEADLESS=true
FB_DELAY_MS=5000
FB_MAX_QUERIES=12
FB_LOOP_MINUTES=60
```

Kunci berkasnya: `chmod 600 /opt/crawlmbahna/worker/.env`

## 4. Pindahkan sesi login dari PC

VPS tidak punya layar, jadi login manual mustahil dilakukan di sana. Login di
PC, lalu pindahkan cookie-nya.

**Di PC (PowerShell):**

```powershell
cd worker
node --env-file=.env fb-worker.mjs --login            # login manual sekali
node --env-file=.env fb-worker.mjs --export-session   # menghasilkan fb-session.json
scp fb-session.json root@IP-VPS:/opt/crawlmbahna/worker/
```

**Di VPS:**

```bash
cd /opt/crawlmbahna/worker
node --env-file=.env fb-worker.mjs --import-session
# harapkan: "sesi diimpor, login TERDETEKSI."
```

`fb-session.json` setara akses akun. Hapus setelah dipakai:
`rm /opt/crawlmbahna/worker/fb-session.json` (di PC juga).

Kalau nanti sesi mati (biasanya berbulan-bulan sekali), ulangi langkah ini.

## 5. Uji sekali jalan

```bash
cd /opt/crawlmbahna/worker
node --env-file=.env fb-worker.mjs --q "demo BBM"
```

Harapan di log: `dapat N post` lalu `terkirim ke app (N post)`. Kalau muncul
`app menolak: HTTP 401`, berarti `FB_WORKER_TOKEN` di VPS dan di Vercel beda.

## 6. Jadikan layanan yang auto-restart

```bash
nano /etc/systemd/system/fb-worker.service
```

```ini
[Unit]
Description=Worker crawl Facebook mbahna
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/crawlmbahna/worker
ExecStart=/usr/bin/node --env-file=.env fb-worker.mjs --loop
Restart=always
RestartSec=30
# Chromium butuh ruang; batasi supaya tidak menghabiskan RAM VPS
MemoryMax=1500M
StandardOutput=append:/var/log/fb-worker.log
StandardError=append:/var/log/fb-worker.log

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now fb-worker
systemctl status fb-worker
tail -f /var/log/fb-worker.log
```

Perintah harian:

```bash
systemctl restart fb-worker     # setelah ubah .env
systemctl stop fb-worker        # hentikan
journalctl -u fb-worker -n 50   # log via journal
```

## 7. RAM pas-pasan (1 GB)

Tambah swap supaya Chromium tidak dibunuh kernel:

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

Turunkan juga bebannya di `.env`: `FB_MAX_QUERIES=6`, `FB_DETAIL_PER_QUERY=3`.

## Memperbarui kode

```bash
cd /opt/crawlmbahna && git pull
cd worker && npm install
systemctl restart fb-worker
```

## Kalau bermasalah

| Gejala | Sebab & tindakan |
|---|---|
| `sesi MATI` | cookie kedaluwarsa → ulangi langkah 4 |
| `app menolak: HTTP 401` | token VPS ≠ token Vercel |
| `dapat 0 post` terus | Facebook membatasi akun → naikkan `FB_DELAY_MS`, turunkan `FB_MAX_QUERIES`, tunggu beberapa jam |
| proses mati sendiri | RAM habis → tambah swap (langkah 7) |
| komentar kosong | struktur halaman Facebook berubah → kirim log, pola ekstraksi perlu disesuaikan |

Ingat: otomasi akun melanggar ToS Facebook. Pakai akun sekunder, dan jaga jeda
tetap wajar.
