// Server-side address geocoder. Pairs with the browser-only geocodeZip.ts.
// Reuses NEXT_PUBLIC_MAPBOX_TOKEN — the same token used by the public map view.

export type AddressInput = {
  name?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

export type AddressGeocode = {
  lat: number;
  lng: number;
  place: string;
};

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

// Without this a hung Mapbox request has no upper bound, and because the bulk
// importer geocodes rows one at a time a single stall blocks the whole batch.
// Bounds the worst-case commit chunk: CHUNK_SIZE x (this + insert time) has to
// stay under the route's maxDuration. See pages/api/locations/bulk.ts.
const GEOCODE_TIMEOUT_MS = 4000;

function buildQuery(input: AddressInput): string {
  // Require at least a street address; geocoding/v5 is for address → coords,
  // not POI name lookup. For POI-only inputs (e.g. "Mission Sports Park") the
  // admin UI's MapboxPlaceSearch already captures coords via the searchbox API.
  if (!input.address?.trim()) return "";

  const parts = [
    input.address.trim(),
    input.city?.trim(),
    input.state?.trim(),
    input.zip?.trim(),
  ].filter(Boolean);

  return parts.join(", ");
}

export async function geocodeAddress(
  input: AddressInput
): Promise<AddressGeocode | null> {
  if (!MAPBOX_TOKEN) return null;

  const query = buildQuery(input);
  if (!query) return null;

  const params = new URLSearchParams({
    country: "us",
    limit: "1",
    access_token: MAPBOX_TOKEN,
  });

  try {
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?${params}`,
      { signal: AbortSignal.timeout(GEOCODE_TIMEOUT_MS) }
    );
    if (!res.ok) {
      console.warn("[geocodeAddress] non-OK response", res.status, query);
      return null;
    }
    const data = await res.json();
    const feature = data?.features?.[0];
    if (!feature?.center || feature.center.length < 2) return null;

    const [lng, lat] = feature.center as [number, number];
    if (!isFinite(lat) || !isFinite(lng)) return null;

    return {
      lat,
      lng,
      place: typeof feature.place_name === "string" ? feature.place_name : query,
    };
  } catch (err: any) {
    // Returning null (rather than throwing) keeps a slow or failing geocode from
    // failing the row — the caller inserts it with NULL lat/lng.
    if (err?.name === "TimeoutError") {
      console.warn("[geocodeAddress] timed out after", GEOCODE_TIMEOUT_MS, "ms", query);
    } else {
      console.warn("[geocodeAddress] fetch failed", err);
    }
    return null;
  }
}
