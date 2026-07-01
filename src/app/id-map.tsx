"use client";

type Prov = {
  province: string;
  heat: number;
  sentiment: string;
  headline: string;
};

// Koordinat approx (lat, lon) tiap provinsi.
const COORDS: { name: string; lat: number; lon: number }[] = [
  { name: "jakarta", lat: -6.2, lon: 106.8 },
  { name: "banten", lat: -6.4, lon: 106.0 },
  { name: "jawa barat", lat: -6.9, lon: 107.6 },
  { name: "jawa tengah", lat: -7.3, lon: 110.1 },
  { name: "yogyakarta", lat: -7.9, lon: 110.4 },
  { name: "jawa timur", lat: -7.6, lon: 112.6 },
  { name: "aceh", lat: 4.7, lon: 96.7 },
  { name: "sumatera utara", lat: 2.3, lon: 99.0 },
  { name: "sumatera barat", lat: -0.9, lon: 100.4 },
  { name: "riau", lat: 0.5, lon: 101.5 },
  { name: "kepulauan riau", lat: 0.9, lon: 104.5 },
  { name: "jambi", lat: -1.6, lon: 103.6 },
  { name: "sumatera selatan", lat: -3.3, lon: 104.0 },
  { name: "bengkulu", lat: -3.8, lon: 102.3 },
  { name: "lampung", lat: -4.8, lon: 105.3 },
  { name: "bangka belitung", lat: -2.7, lon: 106.4 },
  { name: "kalimantan barat", lat: -0.1, lon: 111.5 },
  { name: "kalimantan tengah", lat: -1.7, lon: 113.5 },
  { name: "kalimantan selatan", lat: -3.3, lon: 115.3 },
  { name: "kalimantan timur", lat: 0.5, lon: 116.5 },
  { name: "kalimantan utara", lat: 2.8, lon: 116.5 },
  { name: "sulawesi utara", lat: 1.0, lon: 124.5 },
  { name: "gorontalo", lat: 0.7, lon: 122.4 },
  { name: "sulawesi tengah", lat: -1.4, lon: 121.5 },
  { name: "sulawesi barat", lat: -2.8, lon: 119.2 },
  { name: "sulawesi selatan", lat: -4.0, lon: 120.0 },
  { name: "sulawesi tenggara", lat: -4.1, lon: 122.5 },
  { name: "bali", lat: -8.4, lon: 115.1 },
  { name: "nusa tenggara barat", lat: -8.6, lon: 117.4 },
  { name: "nusa tenggara timur", lat: -8.7, lon: 121.0 },
  { name: "maluku utara", lat: 0.6, lon: 127.8 },
  { name: "maluku", lat: -3.2, lon: 129.5 },
  { name: "papua barat", lat: -1.3, lon: 133.2 },
  { name: "papua pegunungan", lat: -4.0, lon: 138.9 },
  { name: "papua tengah", lat: -3.9, lon: 136.9 },
  { name: "papua selatan", lat: -6.8, lon: 140.0 },
  { name: "papua", lat: -4.3, lon: 138.4 },
];

const REGIONS = [
  { label: "SUMATERA", x: 13, y: 30 },
  { label: "JAWA", x: 30, y: 84 },
  { label: "KALIMANTAN", x: 49, y: 28 },
  { label: "SULAWESI", x: 67, y: 34 },
  { label: "MALUKU", x: 76, y: 52 },
  { label: "PAPUA", x: 90, y: 40 },
  { label: "NUSA TENGGARA", x: 66, y: 90 },
];

function findCoord(prov: string) {
  const p = prov.toLowerCase();
  return COORDS.find((c) => p.includes(c.name) || c.name.includes(p));
}
// Proyeksi lon 94..141, lat 6..-11 -> 0..100%
function project(lat: number, lon: number) {
  const x = ((lon - 94) / 47) * 100;
  const y = ((6 - lat) / 17) * 100;
  return { x: Math.max(2, Math.min(98, x)), y: Math.max(3, Math.min(97, y)) };
}
function heatColor(h: number) {
  if (h >= 80) return "#f26860";
  if (h >= 55) return "#ff9838";
  return "#4f8cff";
}

export default function IndonesiaMap({
  provinces,
  onSelect,
}: {
  provinces: Prov[];
  onSelect: (p: Prov) => void;
}) {
  return (
    <div className="idmap">
      {REGIONS.map((r) => (
        <span
          key={r.label}
          className="idmap-region"
          style={{ left: `${r.x}%`, top: `${r.y}%` }}
        >
          {r.label}
        </span>
      ))}

      {provinces.map((p, i) => {
        const c = findCoord(p.province);
        if (!c) return null;
        const { x, y } = project(c.lat, c.lon);
        const size = 12 + (p.heat / 100) * 16;
        const color = heatColor(p.heat);
        return (
          <button
            key={i}
            className="idmap-dot"
            title={`${p.province} — intensitas ${p.heat}: ${p.headline}`}
            onClick={() => onSelect(p)}
            style={{
              left: `${x}%`,
              top: `${y}%`,
              width: size,
              height: size,
              background: color,
              boxShadow: `0 0 ${p.heat >= 70 ? 14 : 6}px ${color}`,
            }}
          >
            <span className="idmap-label" style={{ color }}>
              {p.province}
            </span>
          </button>
        );
      })}
    </div>
  );
}
