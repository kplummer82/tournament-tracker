import { useCallback, useEffect, useState } from "react";
import { ALL_GAME_SOURCES, type GameSource } from "@/lib/teams/gameSources";

/**
 * Which kinds of games count toward the projections a tournament shows.
 * Persisted globally rather than per tournament so the choice follows
 * the viewer between the Pool, Standings and Bracket tabs — each of those is a
 * separate Pages-Router page, so without this the toggles would reset on every
 * tab click.
 */
const STORAGE_KEY = "tournament-game-sources";

function parse(raw: string | null): GameSource[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const valid = parsed.filter((s): s is GameSource =>
      (ALL_GAME_SOURCES as string[]).includes(s)
    );
    // An empty selection would mean "no data at all" — treat it as corrupt.
    return valid.length > 0 ? valid : null;
  } catch {
    return null;
  }
}

export function useGameSources() {
  const [sources, setSourcesState] = useState<GameSource[]>(ALL_GAME_SOURCES);

  // Read on mount only — localStorage isn't available during SSR.
  useEffect(() => {
    setSourcesState(parse(window.localStorage.getItem(STORAGE_KEY)) ?? ALL_GAME_SOURCES);
  }, []);

  const setSources = useCallback((next: GameSource[]) => {
    if (next.length === 0) return; // never allow an empty selection
    // Keep a stable order so `sources.join(",")` is a usable cache/effect key.
    const ordered = ALL_GAME_SOURCES.filter((s) => next.includes(s));
    setSourcesState(ordered);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ordered));
    } catch {
      /* private mode / quota — the in-memory choice still applies */
    }
  }, []);

  const toggleSource = useCallback(
    (source: GameSource) => {
      setSources(
        sources.includes(source)
          ? sources.filter((s) => s !== source)
          : [...sources, source]
      );
    },
    [sources, setSources]
  );

  return { sources, setSources, toggleSource };
}
