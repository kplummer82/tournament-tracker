// Shared helpers for the walk-up song start time.
//
// The column stores whole seconds from the start of the track, or NULL for
// "play from the beginning". The ceiling mirrors the CHECK constraint in
// database/migration_walkup_song_start_seconds.sql — keep the two in step.

export const WALKUP_START_MAX_SECONDS = 3600;

export type ParsedStartSeconds = {
  /** The value to store. Meaningless when `error` is set. */
  value: number | null;
  /** Non-null when the input was unusable — the caller should 400 with it. */
  error: string | null;
};

/**
 * Normalise a start time coming off a request body.
 *
 * Empty string / null / undefined all mean "clear it". Anything that isn't a
 * whole number in range is rejected rather than silently coerced to NULL — a
 * start time that quietly disappears is worse than a visible error.
 *
 * Returns both fields rather than a discriminated union on purpose: this
 * project compiles with `strict: false`, so `strictNullChecks` is off and TS
 * won't narrow a `{ok: true} | {ok: false}` union at the call site.
 */
export function parseStartSeconds(raw: unknown): ParsedStartSeconds {
  if (raw == null || raw === "") return { value: null, error: null };

  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    return { value: null, error: "Song start time must be a whole number of seconds." };
  }
  if (n < 0 || n > WALKUP_START_MAX_SECONDS) {
    return {
      value: null,
      error: `Song start time must be between 0 and ${WALKUP_START_MAX_SECONDS} seconds.`,
    };
  }
  return { value: n, error: null };
}

/** 95 → "1:35". Used for display; the input itself stays in raw seconds. */
export function formatStartSeconds(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null;
  const whole = Math.floor(seconds);
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}
