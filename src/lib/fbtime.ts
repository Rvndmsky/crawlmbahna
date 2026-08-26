// Pembaca waktu Facebook. Facebook menulis waktu dalam bentuk relatif
// ("3 j", "2 hari yang lalu", "Kemarin") atau tanggal ("12 Agustus",
// "12 Agustus 2026 pukul 10.30"). Semua dikembalikan sebagai unix ms.
// 0 = tidak terbaca.

const BULAN: Record<string, number> = {
  januari: 0, februari: 1, maret: 2, april: 3, mei: 4, juni: 5,
  juli: 6, agustus: 7, september: 8, oktober: 9, november: 10, desember: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, agu: 7, agt: 7,
  sep: 8, okt: 9, nov: 10, des: 11,
  january: 0, february: 1, march: 2, may: 4, june: 5, july: 6,
  august: 7, october: 9, december: 11,
};

const SATUAN_MS: Record<string, number> = {
  dtk: 1000, detik: 1000, s: 1000, second: 1000, seconds: 1000,
  mnt: 60000, menit: 60000, m: 60000, min: 60000, minute: 60000, minutes: 60000,
  j: 3600000, jam: 3600000, h: 3600000, hour: 3600000, hours: 3600000,
  hr: 86400000, hari: 86400000, d: 86400000, day: 86400000, days: 86400000,
  mgg: 604800000, minggu: 604800000, w: 604800000, week: 604800000, weeks: 604800000,
  bln: 2592000000, bulan: 2592000000, month: 2592000000, months: 2592000000,
  thn: 31536000000, tahun: 31536000000, y: 31536000000, year: 31536000000,
};

export function parseFbTime(raw: string, now = Date.now()): number {
  const t = (raw || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!t) return 0;

  if (/baru saja|just now|beberapa detik/.test(t)) return now;
  if (/kemarin|yesterday/.test(t)) return now - 86400000;

  // "3 j", "2 hari yang lalu", "45 mnt", "5h"
  const rel = t.match(
    /(\d+)\s*(dtk|detik|mnt|menit|jam|hari|mgg|minggu|bln|bulan|thn|tahun|s|m|j|h|d|w|y|min|hour|hours|day|days|week|weeks|month|months|year|years)\b/
  );
  if (rel) {
    const n = Number(rel[1]);
    const unit = SATUAN_MS[rel[2]];
    if (n && unit) return now - n * unit;
  }

  // "12 Agustus 2026", "12 Agustus", "12 agu pukul 10.30"
  const tgl = t.match(/(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?/);
  if (tgl) {
    const bulan = BULAN[tgl[2]];
    if (bulan !== undefined) {
      const hari = Number(tgl[1]);
      const nowD = new Date(now);
      const tahun = tgl[3] ? Number(tgl[3]) : nowD.getFullYear();
      const d = new Date(tahun, bulan, hari, 12, 0, 0);
      // Tanpa tahun & tanggalnya di masa depan -> berarti tahun lalu.
      if (!tgl[3] && d.getTime() > now + 86400000) d.setFullYear(tahun - 1);
      return d.getTime();
    }
  }

  // ISO 8601 apa adanya
  const iso = Date.parse(raw);
  return Number.isNaN(iso) ? 0 : iso;
}

// Umur dalam hari. Waktu tak terbaca -> Infinity supaya bisa disaring tegas
// atau dilewatkan, tergantung pemanggilnya.
export function umurHari(ms: number, now = Date.now()): number {
  if (!ms) return Infinity;
  return (now - ms) / 86400000;
}
