// Server-side Mapbox Matrix client: driving durations between coordinates.
// Reuses NEXT_PUBLIC_MAPBOX_TOKEN — the same token used by geocodeAddress.ts.
//
// Returns an N×N matrix of driving times in MINUTES, where [i][j] is the time
// from coords[i] to coords[j]. Returns null on any error so callers can treat
// missing data as "unknown" (no warning) rather than producing false positives.

export type MatrixCoord = { locationId: number; lng: number; lat: number };

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

// Mapbox Matrix API allows at most 25 coordinates per request.
const MAX_COORDS = 25;

async function fetchOneMatrix(coords: MatrixCoord[]): Promise<number[][] | null> {
  if (coords.length < 2) return null;

  const coordStr = coords.map((c) => `${c.lng},${c.lat}`).join(";");
  const params = new URLSearchParams({
    annotations: "duration",
    access_token: MAPBOX_TOKEN,
  });

  try {
    const res = await fetch(
      `https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${coordStr}?${params}`,
    );
    if (!res.ok) {
      console.warn("[travelMatrix] non-OK response", res.status);
      return null;
    }
    const data = await res.json();
    const durations: unknown = data?.durations;
    if (!Array.isArray(durations)) return null;

    // durations is seconds; convert to whole minutes. Mapbox returns null for
    // unroutable pairs — leave those as a large sentinel so they never look "close".
    return (durations as (number | null)[][]).map((row) =>
      row.map((sec) => (sec == null ? Number.MAX_SAFE_INTEGER : Math.round(sec / 60))),
    );
  } catch (err) {
    console.warn("[travelMatrix] fetch failed", err);
    return null;
  }
}

/**
 * Driving-time matrix (minutes) for the given coordinates. For ≤25 coords this is
 * a single Matrix API call; beyond that it falls back to per-origin requests
 * (each origin vs. all destinations) to stay within the 25-coordinate limit.
 */
export async function fetchDrivingMatrix(
  coords: MatrixCoord[],
): Promise<number[][] | null> {
  if (!MAPBOX_TOKEN || coords.length < 2) return null;

  if (coords.length <= MAX_COORDS) {
    return fetchOneMatrix(coords);
  }

  // Large set: compute one row at a time. Each request sends [origin, ...dests]
  // capped at 25, so we batch destinations too. This is rare (a tournament with
  // 25+ distinct predefined locations), so simplicity beats minimizing calls.
  const n = coords.length;
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(Number.MAX_SAFE_INTEGER));
  for (let i = 0; i < n; i++) {
    for (let start = 0; start < n; start += MAX_COORDS - 1) {
      const dests = coords.slice(start, start + (MAX_COORDS - 1));
      const sub = await fetchOneMatrix([coords[i], ...dests]);
      if (!sub) return null;
      // sub[0] is origin→[origin,...dests]; skip index 0 (self) by alignment.
      for (let k = 0; k < dests.length; k++) {
        matrix[i][start + k] = sub[0][k + 1];
      }
      matrix[i][i] = 0;
    }
  }
  return matrix;
}
