"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import React, { useEffect, useRef } from "react";
// Types only — runtime import is dynamic to avoid SSR `window` errors.
import type { Map as MapboxMap, Popup as MapboxPopup, GeoJSONSource } from "mapbox-gl";

type MapboxModule = typeof import("mapbox-gl");

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

// US fallback when no locations have coordinates.
const US_CENTER: [number, number] = [-98.5795, 39.8283];
const US_DEFAULT_ZOOM = 3.5;

export type MapLocation = {
  id: number;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
  field_count: number;
};

type Props = {
  locations: MapLocation[];
};

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function popupHtml(loc: MapLocation) {
  const cityLine = [loc.city, loc.state].filter(Boolean).join(", ");
  const cityZip = [cityLine, loc.zip].filter(Boolean).join(" ");
  return `
    <div style="font-family: var(--font-body); min-width: 180px; max-width: 260px;">
      <div style="font-family: var(--font-display); font-weight: 700; text-transform: uppercase; letter-spacing: -0.01em; font-size: 14px; color: #111; margin-bottom: 4px;">
        ${escapeHtml(loc.name)}
      </div>
      <div style="font-size: 12px; color: #666; line-height: 1.5;">
        ${loc.address ? `<div>${escapeHtml(loc.address)}</div>` : ""}
        ${cityZip ? `<div>${escapeHtml(cityZip)}</div>` : ""}
        <div style="color: #ff4b00; font-weight: 600; margin-top: 2px;">
          ${loc.field_count} field${loc.field_count !== 1 ? "s" : ""}
        </div>
      </div>
    </div>
  `;
}

export default function LocationsMap({ locations }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const popupRef = useRef<MapboxPopup | null>(null);
  const mapboxRef = useRef<MapboxModule | null>(null);
  const readyRef = useRef(false);
  const locationsById = useRef(new Map<number, MapLocation>());

  const featureCollection = React.useMemo(() => {
    const features = locations
      .map((l) => {
        if (l.latitude == null || l.longitude == null) return null;
        const lat = Number(l.latitude);
        const lng = Number(l.longitude);
        if (!isFinite(lat) || !isFinite(lng)) return null;
        return {
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [lng, lat] as [number, number] },
          properties: { id: l.id },
        };
      })
      .filter((f): f is NonNullable<typeof f> => f !== null);
    return { type: "FeatureCollection" as const, features };
  }, [locations]);

  const unmappedCount = locations.length - featureCollection.features.length;

  // Keep a quick lookup map for popups.
  useEffect(() => {
    locationsById.current.clear();
    locations.forEach((l) => locationsById.current.set(l.id, l));
  }, [locations]);

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

        // Custom teardrop pin (SVG → image) — primary orange with white stroke.
        if (!map.hasImage("location-pin")) {
          const pinSvg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="56" viewBox="0 0 40 56">
              <defs>
                <filter id="s" x="-20%" y="-10%" width="140%" height="130%">
                  <feDropShadow dx="0" dy="1.5" stdDeviation="1.2" flood-color="#000" flood-opacity="0.35"/>
                </filter>
              </defs>
              <path filter="url(#s)" fill="#ff4b00" stroke="#ffffff" stroke-width="2.5"
                d="M20 2 C10 2 3 9.5 3 19 C3 31 20 53 20 53 C20 53 37 31 37 19 C37 9.5 30 2 20 2 Z"/>
              <circle cx="20" cy="19" r="6" fill="#ffffff"/>
            </svg>
          `.trim();
          const img = new Image(40, 56);
          img.onload = () => {
            if (disposed || !mapRef.current) return;
            if (!mapRef.current.hasImage("location-pin")) {
              mapRef.current.addImage("location-pin", img, { pixelRatio: 2 });
            }
          };
          img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pinSvg)}`;
        }

        map.addSource("locations", {
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
          source: "locations",
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
          source: "locations",
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["get", "point_count_abbreviated"],
            "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
            "text-size": 12,
          },
          paint: { "text-color": "#ffffff" },
        });

        // Unclustered pins — teardrop marker anchored at the bottom tip.
        map.addLayer({
          id: "unclustered-point",
          type: "symbol",
          source: "locations",
          filter: ["!", ["has", "point_count"]],
          layout: {
            "icon-image": "location-pin",
            "icon-size": 0.875,
            "icon-anchor": "bottom",
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
          },
        });

        // Cluster click → zoom in.
        map.on("click", "clusters", (e) => {
          const feats = map.queryRenderedFeatures(e.point, { layers: ["clusters"] });
          const clusterId = feats[0]?.properties?.cluster_id;
          const source = map.getSource("locations") as GeoJSONSource | undefined;
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
          const loc = locationsById.current.get(Number(id));
          if (!loc) return;

          popupRef.current?.remove();
          popupRef.current = new mapboxgl.Popup({ closeButton: true, offset: 52 })
            .setLngLat(f.geometry.coordinates as [number, number])
            .setHTML(popupHtml(loc))
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
        const source = map.getSource("locations") as GeoJSONSource | undefined;
        source?.setData(featureCollection);
        fitToContent(map, mod, featureCollection);
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

  // Push updated GeoJSON + refit on data change.
  useEffect(() => {
    const map = mapRef.current;
    const mod = mapboxRef.current;
    if (!map || !readyRef.current || !mod) return;
    const source = map.getSource("locations") as GeoJSONSource | undefined;
    if (!source) return;
    source.setData(featureCollection);
    fitToContent(map, mod, featureCollection);
  }, [featureCollection]);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex items-center justify-center h-[500px] border border-border bg-card text-sm text-muted-foreground">
        Map unavailable — Mapbox token not configured.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className="w-full h-[500px] border border-border bg-card"
        aria-label="Locations map"
      />
      {unmappedCount > 0 && (
        <p
          className="text-xs text-muted-foreground"
          style={{ fontFamily: "var(--font-body)" }}
        >
          {unmappedCount} location{unmappedCount !== 1 ? "s" : ""} without map
          coordinates {unmappedCount !== 1 ? "are" : "is"} not shown. Edit a
          location and pick its address to geocode it.
        </p>
      )}
    </div>
  );
}

function fitToContent(
  map: MapboxMap,
  mod: MapboxModule,
  fc: { features: { geometry: { coordinates: [number, number] } }[] }
) {
  if (fc.features.length === 0) {
    map.easeTo({ center: US_CENTER, zoom: US_DEFAULT_ZOOM, duration: 300 });
    return;
  }

  if (fc.features.length === 1) {
    const [lng, lat] = fc.features[0].geometry.coordinates;
    map.easeTo({ center: [lng, lat], zoom: 13, duration: 300 });
    return;
  }

  const bounds = new mod.default.LngLatBounds();
  for (const f of fc.features) {
    bounds.extend(f.geometry.coordinates);
  }
  map.fitBounds(bounds, { padding: 60, duration: 400, maxZoom: 12 });
}
