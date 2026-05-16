export type ZipGeocode = {
  lat: number;
  lng: number;
  place: string;
};

const CACHE_PREFIX = "zipcache:";
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

function readCache(zip: string): ZipGeocode | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(CACHE_PREFIX + zip);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.lat === "number" &&
      typeof parsed?.lng === "number" &&
      typeof parsed?.place === "string"
    ) {
      return parsed as ZipGeocode;
    }
    return null;
  } catch {
    return null;
  }
}

function writeCache(zip: string, value: ZipGeocode) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(CACHE_PREFIX + zip, JSON.stringify(value));
  } catch {
    // sessionStorage may be full or disabled — silently skip
  }
}

export async function geocodeZip(zip: string): Promise<ZipGeocode | null> {
  const trimmed = zip.trim();
  if (!/^\d{5}$/.test(trimmed)) return null;
  if (!MAPBOX_TOKEN) return null;

  const cached = readCache(trimmed);
  if (cached) return cached;

  const params = new URLSearchParams({
    country: "us",
    types: "postcode",
    limit: "1",
    access_token: MAPBOX_TOKEN,
  });

  try {
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(trimmed)}.json?${params}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const feature = data?.features?.[0];
    if (!feature?.center || feature.center.length < 2) return null;

    const [lng, lat] = feature.center as [number, number];
    const place: string = feature.place_name ?? trimmed;

    const value: ZipGeocode = { lat, lng, place };
    writeCache(trimmed, value);
    return value;
  } catch {
    return null;
  }
}
