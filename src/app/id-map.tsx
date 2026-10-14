"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

export type MapPoint = {
  name: string;
  heat: number;
  sentiment: string;
  headline: string;
  lat: number;
  lon: number;
};

function heatColor(h: number) {
  if (h >= 80) return "#f26860";
  if (h >= 55) return "#ff9838";
  return "#4f8cff";
}

export default function IndonesiaMap({
  points,
  onSelect,
}: {
  points: MapPoint[];
  onSelect: (p: MapPoint) => void;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const tileRef = useRef<any>(null);
  const onSelRef = useRef(onSelect);
  onSelRef.current = onSelect;
  const pointsRef = useRef(points);
  pointsRef.current = points;

  function isDark() {
    return document.documentElement.getAttribute("data-theme") !== "light";
  }
  function applyTiles(L: any) {
    const map = mapRef.current;
    if (!map) return;
    if (tileRef.current) map.removeLayer(tileRef.current);
    // Esri Gray Canvas: tanpa API key. CARTO basemaps kini wajib API key
    // (tile-nya berubah jadi gambar "API KEY REQUIRED").
    const varian = isDark() ? "Dark" : "Light";
    const url = `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_${varian}_Gray_Base/MapServer/tile/{z}/{y}/{x}`;
    tileRef.current = L.tileLayer(url, {
      maxZoom: 12,
      minZoom: 3,
      attribution: "Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap",
    }).addTo(map);
  }

  function render(L: any) {
    const lg = layerRef.current;
    if (!lg) return;
    lg.clearLayers();
    (pointsRef.current || []).forEach((p) => {
      if (typeof p.lat !== "number" || typeof p.lon !== "number") return;
      const color = heatColor(p.heat);
      const m = L.circleMarker([p.lat, p.lon], {
        radius: 6 + (p.heat / 100) * 10,
        color: "#fff",
        weight: 1.5,
        fillColor: color,
        fillOpacity: 0.9,
      });
      m.bindTooltip(
        `<b>${p.name}</b> · ${p.heat}<br>${p.headline || ""}`,
        { direction: "top", opacity: 0.95 }
      );
      m.on("click", () => onSelRef.current(p));
      m.addTo(lg);
    });
  }

  useEffect(() => {
    let cancelled = false;
    let obs: MutationObserver | null = null;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !elRef.current || mapRef.current) return;
      const map = L.map(elRef.current, {
        scrollWheelZoom: false,
        attributionControl: true,
      }).setView([-2.3, 118], 4);
      mapRef.current = map;
      applyTiles(L);
      layerRef.current = L.layerGroup().addTo(map);
      render(L);

      // Container kadang belum final ukurannya saat init -> paksa recalculate.
      setTimeout(() => map.invalidateSize(), 60);
      setTimeout(() => map.invalidateSize(), 400);
      window.addEventListener("resize", onResize);

      // Ganti tile otomatis saat tema berubah (dark <-> light).
      obs = new MutationObserver(() => applyTiles(L));
      obs.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"],
      });
    })();
    function onResize() {
      mapRef.current?.invalidateSize();
    }
    return () => {
      cancelled = true;
      if (obs) obs.disconnect();
      window.removeEventListener("resize", onResize);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      if (!mapRef.current) return;
      const L = (await import("leaflet")).default;
      render(L);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);

  return <div ref={elRef} className="idmap-leaflet" />;
}
