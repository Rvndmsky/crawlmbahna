// Tabel koordinat kota/kabupaten & provinsi Indonesia.
// Dipakai untuk menempatkan marker peta secara akurat (koordinat dari model AI
// sering salah, jadi kita override dengan tabel ini bila cocok).

type LL = [number, number];

const CITY: Record<string, LL> = {
  // Jawa
  jakarta: [-6.2, 106.82],
  bandung: [-6.92, 107.61],
  bogor: [-6.6, 106.8],
  bekasi: [-6.24, 106.99],
  depok: [-6.4, 106.82],
  tangerang: [-6.18, 106.63],
  "tangerang selatan": [-6.29, 106.72],
  serang: [-6.12, 106.15],
  cilegon: [-6.02, 106.05],
  cirebon: [-6.71, 108.56],
  sukabumi: [-6.92, 106.93],
  tasikmalaya: [-7.33, 108.22],
  garut: [-7.21, 107.9],
  cianjur: [-6.82, 107.14],
  karawang: [-6.3, 107.3],
  purwakarta: [-6.56, 107.44],
  semarang: [-6.97, 110.42],
  yogyakarta: [-7.8, 110.36],
  jogja: [-7.8, 110.36],
  sleman: [-7.72, 110.35],
  bantul: [-7.89, 110.33],
  surakarta: [-7.57, 110.83],
  solo: [-7.57, 110.83],
  magelang: [-7.47, 110.22],
  salatiga: [-7.33, 110.5],
  pekalongan: [-6.89, 109.68],
  tegal: [-6.87, 109.14],
  kudus: [-6.8, 110.84],
  surabaya: [-7.26, 112.75],
  malang: [-7.98, 112.63],
  sidoarjo: [-7.45, 112.72],
  gresik: [-7.16, 112.65],
  kediri: [-7.82, 112.01],
  jember: [-8.17, 113.7],
  banyuwangi: [-8.22, 114.37],
  madiun: [-7.63, 111.52],
  probolinggo: [-7.75, 113.22],
  pasuruan: [-7.65, 112.91],
  mojokerto: [-7.47, 112.43],
  // Sumatera
  medan: [3.59, 98.67],
  binjai: [3.6, 98.49],
  "pematang siantar": [2.96, 99.06],
  "banda aceh": [5.55, 95.32],
  lhokseumawe: [5.18, 97.14],
  padang: [-0.95, 100.35],
  bukittinggi: [-0.3, 100.37],
  pekanbaru: [0.51, 101.45],
  dumai: [1.67, 101.45],
  jambi: [-1.61, 103.61],
  palembang: [-2.98, 104.76],
  bengkulu: [-3.79, 102.26],
  "bandar lampung": [-5.43, 105.26],
  "pangkal pinang": [-2.13, 106.11],
  "pangkalpinang": [-2.13, 106.11],
  batam: [1.08, 104.03],
  "tanjung pinang": [0.92, 104.46],
  // Kalimantan
  pontianak: [-0.03, 109.34],
  singkawang: [0.9, 108.98],
  "palangka raya": [-2.21, 113.92],
  palangkaraya: [-2.21, 113.92],
  banjarmasin: [-3.32, 114.59],
  banjarbaru: [-3.44, 114.84],
  samarinda: [-0.5, 117.15],
  balikpapan: [-1.24, 116.85],
  bontang: [0.13, 117.48],
  tarakan: [3.31, 117.59],
  nunukan: [4.13, 117.66],
  // Sulawesi
  manado: [1.49, 124.84],
  bitung: [1.44, 125.19],
  gorontalo: [0.54, 123.06],
  palu: [-0.9, 119.87],
  makassar: [-5.15, 119.43],
  parepare: [-4.01, 119.62],
  palopo: [-2.99, 120.2],
  kendari: [-3.97, 122.51],
  baubau: [-5.47, 122.63],
  "bau-bau": [-5.47, 122.63],
  mamuju: [-2.68, 118.89],
  // Bali & Nusa Tenggara
  denpasar: [-8.65, 115.22],
  singaraja: [-8.11, 115.09],
  mataram: [-8.58, 116.1],
  bima: [-8.46, 118.73],
  kupang: [-10.18, 123.61],
  ende: [-8.84, 121.66],
  maumere: [-8.62, 122.21],
  // Maluku & Papua
  ambon: [-3.7, 128.18],
  ternate: [0.79, 127.38],
  sofifi: [0.73, 127.56],
  tual: [-5.64, 132.75],
  jayapura: [-2.53, 140.72],
  manokwari: [-0.86, 134.06],
  sorong: [-0.88, 131.25],
  nabire: [-3.36, 135.5],
  timika: [-4.55, 136.89],
  wamena: [-4.1, 138.95],
  merauke: [-8.49, 140.4],
  biak: [-1.19, 136.09],
};

const PROVINCE: Record<string, LL> = {
  aceh: [4.7, 96.7],
  "sumatera utara": [2.5, 99.0],
  "sumatera barat": [-0.7, 100.5],
  riau: [0.5, 101.4],
  "kepulauan riau": [0.9, 104.5],
  jambi: [-1.6, 103.6],
  "sumatera selatan": [-3.2, 104.0],
  bengkulu: [-3.8, 102.3],
  lampung: [-4.8, 105.3],
  "bangka belitung": [-2.7, 106.4],
  jakarta: [-6.2, 106.8],
  "jawa barat": [-6.9, 107.6],
  banten: [-6.4, 106.1],
  "jawa tengah": [-7.3, 110.1],
  yogyakarta: [-7.8, 110.4],
  "jawa timur": [-7.6, 112.5],
  bali: [-8.4, 115.1],
  "nusa tenggara barat": [-8.6, 117.4],
  "nusa tenggara timur": [-8.7, 121.0],
  "kalimantan barat": [-0.1, 111.5],
  "kalimantan tengah": [-1.7, 113.5],
  "kalimantan selatan": [-3.3, 115.3],
  "kalimantan timur": [-0.5, 117.1],
  "kalimantan utara": [2.8, 116.5],
  "sulawesi utara": [1.0, 124.5],
  gorontalo: [0.7, 122.4],
  "sulawesi tengah": [-1.4, 121.5],
  "sulawesi barat": [-2.8, 119.2],
  "sulawesi selatan": [-4.0, 120.0],
  "sulawesi tenggara": [-4.1, 122.5],
  maluku: [-3.2, 129.5],
  "maluku utara": [0.6, 127.8],
  papua: [-4.3, 140.0],
  "papua barat": [-1.3, 133.2],
  "papua tengah": [-3.9, 136.9],
  "papua pegunungan": [-4.0, 138.9],
  "papua selatan": [-7.5, 140.0],
};

function norm(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/^(kota\s+administrasi|kota|kabupaten|kab\.?|kotamadya|kotamadya)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function lookup(table: Record<string, LL>, name: string): LL | null {
  const n = norm(name);
  if (!n) return null;
  if (table[n]) return table[n];
  // jakarta pusat/selatan/timur/barat/utara -> jakarta
  if (n.includes("jakarta")) return table["jakarta"] || null;
  for (const k of Object.keys(table)) {
    if (n.includes(k) || k.includes(n)) return table[k];
  }
  return null;
}

// Koordinat valid dalam batas Indonesia?
function inID(lat: number, lon: number): boolean {
  return lat >= -11 && lat <= 6.5 && lon >= 94 && lon <= 141;
}

export function resolveCoord(
  kota: string,
  provinsi: string,
  fLat?: number,
  fLon?: number
): LL | null {
  const byCity = lookup(CITY, kota);
  if (byCity) return byCity;
  const byProv = lookup(PROVINCE, provinsi);
  if (byProv) return byProv;
  if (typeof fLat === "number" && typeof fLon === "number" && inID(fLat, fLon)) {
    return [fLat, fLon];
  }
  return null;
}
