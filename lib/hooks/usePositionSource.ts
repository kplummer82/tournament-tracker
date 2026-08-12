import { useCallback, useEffect, useState } from "react";

/**
 * Which coach's position ratings a screen is showing. Persisted per team so a
 * coach's choice follows them between the roster list and a game's Defense tab
 * and survives a reload.
 */
export type PositionSource =
  | { view: "mine" }
  | { view: "consensus" }
  | { view: "author"; authorId: string };

const DEFAULT_SOURCE: PositionSource = { view: "mine" };

function storageKey(teamId: number | string): string {
  return `positions-view:${teamId}`;
}

function parse(raw: string | null): PositionSource | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PositionSource;
    if (parsed?.view === "mine" || parsed?.view === "consensus") return { view: parsed.view };
    if (parsed?.view === "author" && typeof parsed.authorId === "string") {
      return { view: "author", authorId: parsed.authorId };
    }
  } catch {
    /* corrupt value — fall back to the default */
  }
  return null;
}

/** Serializes a source into the `?view=…[&authorId=…]` the positions APIs take. */
export function positionSourceQuery(source: PositionSource): string {
  if (source.view === "author") {
    return `view=author&authorId=${encodeURIComponent(source.authorId)}`;
  }
  return `view=${source.view}`;
}

/**
 * `canAuthor` is what the positions API reports back — pass it once known.
 * While it's undefined the stored choice is left alone; once it resolves to
 * false, "My assignments" is meaningless (the viewer keeps no set of their own)
 * so the selection falls back to Consensus.
 */
export function usePositionSource(
  teamId: number | string | undefined,
  canAuthor?: boolean
) {
  const [source, setSourceState] = useState<PositionSource>(DEFAULT_SOURCE);

  // Read on mount only — localStorage isn't available during SSR.
  useEffect(() => {
    if (teamId == null) return;
    setSourceState(parse(window.localStorage.getItem(storageKey(teamId))) ?? DEFAULT_SOURCE);
  }, [teamId]);

  useEffect(() => {
    if (canAuthor === false) {
      setSourceState((prev) => (prev.view === "mine" ? { view: "consensus" } : prev));
    }
  }, [canAuthor]);

  const setSource = useCallback(
    (next: PositionSource) => {
      setSourceState(next);
      if (teamId == null) return;
      try {
        window.localStorage.setItem(storageKey(teamId), JSON.stringify(next));
      } catch {
        /* private mode / quota — the in-memory choice still applies */
      }
    },
    [teamId]
  );

  return { source, setSource };
}
