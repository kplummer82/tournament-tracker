"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import React, { useEffect, useRef } from "react";
import type { ListingRow } from "@/components/scrimmages/ListingCard";
// Types only — runtime import is dynamic to avoid SSR `window` errors.
import type { Map as MapboxMap, Popup as MapboxPopup, GeoJSONSource } from "mapbox-gl";

type MapboxModule = typeof import("mapbox-gl");

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

// US fallback when no listings / no center available.
const US_CENTER: [number, number] = [-98.5795, 39.8283];
const US_DEFAULT_ZOOM = 3.5;

export type MapCenter = {
  lat: number;
  lng: number;
  radiusMiles: number;
};

type Props = {
  listings: ListingRow[];
  center?: MapCenter | null;
};

function formatDate(iso: string) {
  const dateStr = iso.includes("T") ? iso.split("T")[0] : iso;
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatTime(t: string | null) {
  if (!t) return null;
  const [h, m] = t.split(":");
  const hr = parseInt(h, 10);
  const ampm = hr >= 12 ? "PM" : "AM";
  const h12 = hr % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function popupHtml(l: ListingRow) {
  const date = formatDate(l.available_date);
  const time =
    l.time_earliest && l.time_latest
      ? `${formatTime(l.time_earliest)} – ${formatTime(l.time_latest)}`
      : l.time_earliest
        ? `From ${formatTime(l.time_earliest)}`
        : l.time_latest
          ? `Until ${formatTime(l.time_latest)}`
          : "Flexible";

  const ageStr =
    l.age_range_min != null && l.age_range_max != null
      ? `Ages ${l.age_range_min}–${l.age_range_max}`
      : l.age_range_min != null
        ? `Ages ${l.age_range_min}+`
        : l.age_range_max != null
          ? `Ages ≤${l.age_range_max}`
          : "";

  return `
    <div style="font-family: var(--font-body); min-width: 200px; max-width: 260px;">
      <div style="font-family: var(--font-display); font-weight: 700; text-transform: uppercase; letter-spacing: -0.01em; font-size: 14px; margin-bottom: 4px;">
        ${escapeHtml(l.team_name)}
      </div>
      <div style="font-size: 12px; color: var(--muted-foreground, #888); line-height: 1.5;">
        <div>${escapeHtml(date)}</div>
        <div>${escapeHtml(time ?? "")}</div>
        ${ageStr ? `<div>${escapeHtml(ageStr)}</div>` : ""}
        ${l.distance_miles != null ? `<div style="color: var(--primary, #ff4b00); font-weight: 600; margin-top: 2px;">${l.distance_miles.toFixed(1)} mi away</div>` : ""}
      </div>
      <a
        href="/scrimmages/${l.id}"
        style="display: inline-block; margin-top: 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--primary, #ff4b00); text-decoration: none; font-weight: 600;"
      >
        View details →
      </a>
    </div>
  `;
}

// Approximate bbox around a center + radius (miles). 1 deg lat ≈ 69 mi.
function radiusBounds(lat: number, lng: number, miles: number): [[number, number], [number, number]] {
  const latDelta = miles / 69;
  const lngDelta = miles / (69 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  return [
    [lng - lngDelta, lat - latDelta],
    [lng + lngDelta, lat + latDelta],
  ];
}

export default function ScrimmageMap({ listings, center }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const popupRef = useRef<MapboxPopup | null>(null);
  const mapboxRef = useRef<MapboxModule | null>(null);
  const readyRef = useRef(false);
  const listingsById = useRef(new Map<number, ListingRow>());

  // Build a GeoJSON FeatureCollection from listings with coords.
  const featureCollection = React.useMemo(() => {
    const features = listings
      .map((l) => {
        if (l.location_lat == null || l.location_lng == null) return null;
        const lat = Number(l.location_lat);
        const lng = Number(l.location_lng);
        if (!isFinite(lat) || !isFinite(lng)) return null;
        return {
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [lng, lat] as [number, number] },
          properties: { id: l.id },
        };
      })
      .filter((f): f is NonNullable<typeof f> => f !== null);
    return { type: "FeatureCollection" as const, features };
  }, [listings]);

  // Keep a quick lookup map for popups.
  useEffect(() => {
    listingsById.current.clear();
    listings.forEach((l) => listingsById.current.set(l.id, l));
  }, [listings]);

  // Init map once.
  useEffect(() => {
    if (!containerRef.current) return;
    if (!MAPBOX_TOKEN) {
      // No token configured — bail out gracefully.
      return;
    }

    let disposed = false;

    (async () => {
      const mod = await import("mapbox-gl");
      if (disposed) return;
      const mapboxgl = mod.default;
      mapboxgl.accessToken = MAPBOX_TOKEN;
      mapboxRef.current = mod;

      const map = new mapboxgl.Map({
        container: containerRef.current!,
        style: "mapbox://styles/mapbox/streets-v12",
        center: US_CENTER,
        zoom: US_DEFAULT_ZOOM,
      });
      mapRef.current = map;

      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

      map.on("load", () => {
        if (disposed) return;

        map.addSource("listings", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
          cluster: true,
          clusterMaxZoom: 14,
          clusterRadius: 50,
        });

        // Cluster bubbles.
        map.addLayer({
          id: "clusters",
          type: "circle",
          source: "listings",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "#ff4b00",
            "circle-opacity": 0.85,
            "circle-radius": [
              "step",
              ["get", "point_count"],
              16,
              10, 22,
              30, 28,
            ],
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 2,
          },
        });

        // Cluster counts.
        map.addLayer({
          id: "cluster-count",
          type: "symbol",
          source: "listings",
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["get", "point_count_abbreviated"],
            "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
            "text-size": 12,
          },
          paint: { "text-color": "#ffffff" },
        });

        // Unclustered pins.
        map.addLayer({
          id: "unclustered-point",
          type: "circle",
          source: "listings",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": "#ff4b00",
            "circle-radius": 8,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 2,
          },
        });

        // Cluster click → zoom in.
        map.on("click", "clusters", (e) => {
          const feats = map.queryRenderedFeatures(e.point, { layers: ["clusters"] });
          const clusterId = feats[0]?.properties?.cluster_id;
          const source = map.getSource("listings") as GeoJSONSource | undefined;
          if (!source || clusterId == null) return;
          source.getClusterExpansionZoom(clusterId, (err, zoom) => {
            if (err) return;
            const geom = feats[0].geometry;
            if (geom.type !== "Point") return;
            map.easeTo({
              center: geom.coordinates as [number, number],
              zoom: zoom ?? map.getZoom() + 1,
            });
          });
        });

        // Pin click → popup.
        map.on("click", "unclustered-point", (e) => {
          const f = e.features?.[0];
          if (!f || f.geometry.type !== "Point") return;
          const id = (f.properties as { id?: number })?.id;
          if (id == null) return;
          const listing = listingsById.current.get(Number(id));
          if (!listing) return;

          popupRef.current?.remove();
          popupRef.current = new mapboxgl.Popup({ closeButton: true, offset: 14 })
            .setLngLat(f.geometry.coordinates as [number, number])
            .setHTML(popupHtml(listing))
            .addTo(map);
        });

        // Cursor affordances.
        for (const layer of ["clusters", "unclustered-point"]) {
          map.on("mouseenter", layer, () => {
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", layer, () => {
            map.getCanvas().style.cursor = "";
          });
        }

        readyRef.current = true;

        // First-time data load — apply whatever the current props say.
        const source = map.getSource("listings") as GeoJSONSource | undefined;
        source?.setData(featureCollection);
        fitToContent(map, mod, featureCollection, center ?? null);
      });
    })();

    return () => {
      disposed = true;
      popupRef.current?.remove();
      popupRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push updated GeoJSON + refit on data/center change.
  useEffect(() => {
    const map = mapRef.current;
    const mod = mapboxRef.current;
    if (!map || !readyRef.current || !mod) return;
    const source = map.getSource("listings") as GeoJSONSource | undefined;
    if (!source) return;
    source.setData(featureCollection);
    fitToContent(map, mod, featureCollection, center ?? null);
  }, [featureCollection, center]);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex items-center justify-center h-[500px] border border-border bg-card text-sm text-muted-foreground">
        Map unavailable — Mapbox token not configured.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-[500px] border border-border bg-card"
      aria-label="Scrimmage results map"
    />
  );
}

function fitToContent(
  map: MapboxMap,
  mod: MapboxModule,
  fc: { features: { geometry: { coordinates: [number, number] } }[] },
  center: MapCenter | null
) {
  // If we have a zip+radius, prefer that bounding box — keeps the search area in view
  // even if results cluster on one edge of it.
  if (center) {
    const bounds = radiusBounds(center.lat, center.lng, center.radiusMiles);
    map.fitBounds(bounds, { padding: 40, duration: 400, maxZoom: 12 });
    return;
  }

  if (fc.features.length === 0) {
    map.easeTo({ center: US_CENTER, zoom: US_DEFAULT_ZOOM, duration: 300 });
    return;
  }

  if (fc.features.length === 1) {
    const [lng, lat] = fc.features[0].geometry.coordinates;
    map.easeTo({ center: [lng, lat], zoom: 11, duration: 300 });
    return;
  }

  const bounds = new mod.default.LngLatBounds();
  for (const f of fc.features) {
    bounds.extend(f.geometry.coordinates);
  }
  map.fitBounds(bounds, { padding: 60, duration: 400, maxZoom: 12 });
}
