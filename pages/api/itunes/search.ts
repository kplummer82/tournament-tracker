import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";

// Server-side proxy for the iTunes Search API.
//
// WHY THIS EXISTS: calling https://itunes.apple.com/search directly from the
// browser works on desktop but fails on every iOS/WebKit browser. Apple
// redirects the request to the `musics://` app-deep-link scheme when it sees an
// Apple device, and fetch() refuses to follow a cross-origin redirect into a
// non-CORS scheme — the promise rejects and the typeahead silently shows
// nothing. Fetching from the server sidesteps the device sniffing entirely.

type ItunesTrack = {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName?: string;
  artworkUrl60?: string;
};

const MAX_QUERY_LEN = 120;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const raw = Array.isArray(req.query.q) ? req.query.q[0] : req.query.q;
  const q = (raw ?? "").trim().slice(0, MAX_QUERY_LEN);
  if (!q) return res.status(200).json({ results: [] });

  // Honour the admin feature flag server-side too, so disabling it actually
  // stops outbound calls rather than just hiding the UI.
  try {
    const rows = await sql`SELECT value FROM app_settings WHERE key = 'itunes_enabled'`;
    if (rows[0]?.value === "false") {
      return res.status(200).json({ results: [], disabled: true });
    }
  } catch {
    // Fail open — a settings lookup failure shouldn't break song search.
  }

  const url =
    `https://itunes.apple.com/search?term=${encodeURIComponent(q)}` +
    `&entity=song&limit=8&media=music`;

  try {
    const upstream = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      headers: {
        // A neutral UA keeps Apple from redirecting us to `musics://`.
        "User-Agent": "stackedbench/1.0 (+https://stackedbench.com)",
        Accept: "application/json",
      },
    });
    if (!upstream.ok) {
      return res.status(502).json({ error: "Song search is unavailable right now." });
    }

    // Apple serves this as text/javascript, so parse the text ourselves.
    const json = JSON.parse(await upstream.text());
    const results: ItunesTrack[] = (Array.isArray(json.results) ? json.results : [])
      .filter((t: ItunesTrack) => t && typeof t.trackId === "number" && t.trackName)
      .map((t: ItunesTrack) => ({
        trackId: t.trackId,
        trackName: t.trackName,
        artistName: t.artistName,
        collectionName: t.collectionName,
        artworkUrl60: t.artworkUrl60,
      }));

    // Song metadata is effectively static; let the CDN absorb repeat queries.
    res.setHeader(
      "Cache-Control",
      "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800"
    );
    return res.status(200).json({ results });
  } catch (err: unknown) {
    console.error("[itunes/search]", err);
    return res.status(502).json({ error: "Song search is unavailable right now." });
  }
}
