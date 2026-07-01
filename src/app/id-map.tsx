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
    const url = isDark()
      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
    tileRef.current = L.tileLayer(url, {
      subdomains: "abcd",
      maxZoom: 12,
      minZoom: 3,
      attribution: "&copy; OpenStreetMap &copy; CARTO",
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
        `<b>${p.name}</b> · 🔥${p.heat}<br>${p.headline || ""}`,
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

      // Ganti tile otomatis saat tema berubah (dark <-> light).
      obs = new MutationObserver(() => applyTiles(L));
      obs.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"],
      });
    })();
    return () => {
      cancelled = true;
      if (obs) obs.disconnect();
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
