import { useCallback, useEffect, useRef, useState } from "react";
import { Music, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { WALKUP_START_MAX_SECONDS, formatStartSeconds } from "@/lib/roster/walkupSong";

// Module-level cache so multiple WalkupSongInput instances share one fetch per page load.
let _settingsPromise: Promise<boolean> | null = null;
function fetchItunesEnabled(): Promise<boolean> {
  if (!_settingsPromise) {
    _settingsPromise = fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => d?.itunes_enabled !== false)
      .catch(() => true); // fail open — don't disable the feature on a network error
  }
  return _settingsPromise;
}

/* ─── iTunes search ──────────────────────────────────────────── */
export type ItunesTrack = {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName?: string;
  artworkUrl60?: string;
};

export function appleMusicUrl(itunesId: number): string {
  return `https://music.apple.com/us/song/${itunesId}`;
}

// Goes through our own API rather than hitting itunes.apple.com directly:
// Apple redirects browser requests from Apple devices to the `musics://` scheme,
// which fetch() refuses to follow, so the direct call always failed on iOS.
export async function searchItunes(q: string): Promise<ItunesTrack[]> {
  if (!q.trim()) return [];
  const res = await fetch(`/api/itunes/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error("iTunes API error");
  const json = await res.json();
  return Array.isArray(json.results) ? json.results : [];
}

/* ─── WalkupSongInput ─────────────────────────────────────────── */
const DROPDOWN_MAX_HEIGHT = 224; // px — matches the old max-h-56
const DROPDOWN_MIN_HEIGHT = 96; // below this the panel is too short to be useful
const DROPDOWN_GUTTER = 8;

/**
 * Song, track id and start time travel together — picking a suggestion sets the
 * first two, clearing the field wipes all three — so they're one value rather
 * than three loosely-coupled callbacks.
 */
export type WalkupSongValue = {
  song: string;
  itunesId: number | null;
  startSeconds: number | null;
};

type WalkupSongInputProps = {
  value: string;
  itunesId: number | null;
  startSeconds: number | null;
  onChange: (next: WalkupSongValue) => void;
  onBlurCommit: () => void;
};

export function WalkupSongInput({
  value,
  itunesId: _itunesId,
  startSeconds,
  onChange,
  onBlurCommit,
}: WalkupSongInputProps) {
  const [query, setQuery] = useState(value);
  // Kept as a string so the box can be emptied without snapping back to 0.
  const [startText, setStartText] = useState(startSeconds == null ? "" : String(startSeconds));
  const [results, setResults] = useState<ItunesTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState(!!_itunesId);
  const [itunesEnabled, setItunesEnabled] = useState(true); // default true while loading
  // Where the dropdown goes, and how tall it may be. On phones the field often
  // sits near the bottom of the screen with the on-screen keyboard covering
  // everything below it, so a fixed drop-down panel would be invisible.
  const [placement, setPlacement] = useState<{ dropUp: boolean; maxHeight: number }>({
    dropUp: false,
    maxHeight: DROPDOWN_MAX_HEIGHT,
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchItunesEnabled().then(setItunesEnabled);
  }, []);

  // visualViewport (rather than innerHeight) is what shrinks when the on-screen
  // keyboard opens, so it tells us the space the user can actually see.
  const measurePlacement = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    const top = vv ? vv.offsetTop : 0;
    const bottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
    const spaceBelow = bottom - rect.bottom - DROPDOWN_GUTTER;
    const spaceAbove = rect.top - top - DROPDOWN_GUTTER;
    const dropUp = spaceBelow < DROPDOWN_MIN_HEIGHT && spaceAbove > spaceBelow;
    const available = Math.max(dropUp ? spaceAbove : spaceBelow, DROPDOWN_MIN_HEIGHT);
    setPlacement({ dropUp, maxHeight: Math.min(DROPDOWN_MAX_HEIGHT, available) });
  }, []);

  // Keep the panel placed correctly as the keyboard opens/closes or the page scrolls.
  useEffect(() => {
    if (!dropdownOpen) return;
    measurePlacement();
    const vv = window.visualViewport;
    vv?.addEventListener("resize", measurePlacement);
    vv?.addEventListener("scroll", measurePlacement);
    window.addEventListener("scroll", measurePlacement, true);
    return () => {
      vv?.removeEventListener("resize", measurePlacement);
      vv?.removeEventListener("scroll", measurePlacement);
      window.removeEventListener("scroll", measurePlacement, true);
    };
  }, [dropdownOpen, measurePlacement]);

  // sync from parent when it changes externally
  useEffect(() => {
    setQuery(value);
    setSelected(!!_itunesId);
  }, [value, _itunesId]);

  useEffect(() => {
    setStartText(startSeconds == null ? "" : String(startSeconds));
  }, [startSeconds]);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); setNotice(null); setDropdownOpen(false); return; }
    if (!itunesEnabled) { setResults([]); setNotice(null); setDropdownOpen(false); return; }
    setSearching(true);
    try {
      const tracks = await searchItunes(q);
      setResults(tracks);
      // Say something either way — a silent no-op reads as a broken field.
      setNotice(tracks.length ? null : "No songs found. You can type it in manually.");
      measurePlacement();
      setDropdownOpen(true);
    } catch {
      setResults([]);
      setNotice("Song search is unavailable. You can type it in manually.");
      measurePlacement();
      setDropdownOpen(true);
    } finally {
      setSearching(false);
    }
  }, [itunesEnabled, measurePlacement]);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setQuery(q);
    setSelected(false);
    setNotice(null);
    onChange({ song: q, itunesId: null, startSeconds });
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(q), 400);
  };

  const pickTrack = (t: ItunesTrack) => {
    const label = `${t.trackName} — ${t.artistName}`;
    setQuery(label);
    setSelected(true);
    setNotice(null);
    setDropdownOpen(false);
    onChange({ song: label, itunesId: t.trackId, startSeconds });
    setTimeout(onBlurCommit, 0);
  };

  // Clearing the song clears its start time too — a start time with no song to
  // play is meaningless, and leaving it behind would silently apply to whatever
  // song is typed next.
  const clearSong = () => {
    setQuery("");
    setStartText("");
    setSelected(false);
    setNotice(null);
    setDropdownOpen(false);
    onChange({ song: "", itunesId: null, startSeconds: null });
    setTimeout(onBlurCommit, 0);
  };

  const handleStartInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Strip anything that isn't a digit so a stray "-" or "e" (both legal in a
    // number input) can't reach the API as NaN.
    const raw = e.target.value.replace(/[^0-9]/g, "");
    setStartText(raw);
    if (raw === "") {
      onChange({ song: query, itunesId: _itunesId, startSeconds: null });
      return;
    }
    const n = Math.min(parseInt(raw, 10), WALKUP_START_MAX_SECONDS);
    onChange({ song: query, itunesId: _itunesId, startSeconds: n });
  };

  const commitStart = () => {
    // Re-render the box from the clamped value, so typing 9999 visibly settles
    // at the ceiling instead of looking accepted and then saving something else.
    const n = startText === "" ? null : Math.min(parseInt(startText, 10), WALKUP_START_MAX_SECONDS);
    setStartText(n == null || Number.isNaN(n) ? "" : String(n));
    onBlurCommit();
  };

  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, []);

  const startHint = formatStartSeconds(startSeconds);

  return (
    <div className="flex items-start gap-2">
    <div className="relative min-w-0 flex-1" ref={containerRef}>
      <div className="relative">
        <Music className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={handleInput}
          onBlur={() => { setDropdownOpen(false); onBlurCommit(); }}
          placeholder="Search or type a song…"
          className={cn(
            "w-full pl-7 pr-7 py-1.5 text-xs bg-input-bg border border-border",
            "focus:outline-none focus:border-primary transition-colors duration-100",
            selected ? "text-primary" : "text-foreground"
          )}
          style={{ fontFamily: "var(--font-body)" }}
        />
        {searching && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">…</span>
        )}
        {query && !searching && (
          <button
            type="button"
            onPointerDown={(e) => { e.preventDefault(); clearSong(); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {dropdownOpen && (results.length > 0 || notice) && (
        <div
          className={cn(
            "absolute z-50 left-0 right-0 bg-card border border-border shadow-lg overflow-y-auto overscroll-contain",
            placement.dropUp ? "bottom-full mb-0.5" : "top-full mt-0.5"
          )}
          style={{ maxHeight: placement.maxHeight }}
        >
          {notice && results.length === 0 && (
            <p
              className="px-2 py-1.5 text-[10px] text-muted-foreground"
              style={{ fontFamily: "var(--font-body)" }}
            >
              {notice}
            </p>
          )}
          {results.map((t) => (
            <button
              key={t.trackId}
              type="button"
              onPointerDown={(e) => { e.preventDefault(); pickTrack(t); }}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-elevated transition-colors duration-75"
            >
              {t.artworkUrl60 && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.artworkUrl60} alt="" className="h-7 w-7 shrink-0 object-cover" />
              )}
              <div className="min-w-0">
                <p className="text-xs font-medium truncate" style={{ fontFamily: "var(--font-body)" }}>{t.trackName}</p>
                <p className="text-[10px] text-muted-foreground truncate" style={{ fontFamily: "var(--font-body)" }}>{t.artistName}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>

      {/* Start time. Seconds from the top of the track — most walk-up songs are
          cued to a chorus or a drop, not 0:00. */}
      <div className="shrink-0">
        <div className="relative">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={startText}
            onChange={handleStartInput}
            onBlur={commitStart}
            placeholder="0"
            aria-label="Song start time in seconds"
            title={
              startHint
                ? `Starts at ${startHint} (${startSeconds}s into the song)`
                : "Start playing this many seconds into the song"
            }
            className={cn(
              "w-14 pl-2 pr-5 py-1.5 text-xs tabular-nums bg-input-bg border border-border",
              "focus:outline-none focus:border-primary transition-colors duration-100",
              "placeholder:text-muted-foreground/50"
            )}
            style={{ fontFamily: "var(--font-body)" }}
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">
            s
          </span>
        </div>
        {startHint && (
          <p
            className="mt-0.5 text-[10px] text-muted-foreground text-center tabular-nums"
            style={{ fontFamily: "var(--font-body)" }}
          >
            {startHint}
          </p>
        )}
      </div>
    </div>
  );
}

/* ─── WalkupSongLink (read-only display chip) ────────────────── */
export function WalkupSongLink({
  song,
  itunesId,
  startSeconds = null,
}: {
  song: string;
  itunesId: number | null;
  startSeconds?: number | null;
}) {
  const parts = song.split(" — ");
  const trackName = parts[0] || song;
  const artistName = parts.length > 1 ? parts.slice(1).join(" — ") : null;
  const startHint = formatStartSeconds(startSeconds);

  const chip = (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 rounded-full",
        "bg-muted/60 text-xs max-w-full",
        itunesId
          ? "hover:bg-primary/10 hover:text-primary cursor-pointer transition-colors duration-100 group"
          : ""
      )}
    >
      <Music
        className={cn(
          "h-3 w-3 shrink-0",
          itunesId ? "text-primary/70 group-hover:text-primary" : "text-muted-foreground"
        )}
      />
      <span className="truncate" style={{ fontFamily: "var(--font-body)" }}>
        <span className="font-medium">{trackName}</span>
        {artistName && (
          <span className="text-muted-foreground"> — {artistName}</span>
        )}
      </span>
      {startHint && (
        <span
          className="shrink-0 tabular-nums text-[10px] text-muted-foreground"
          title={`Starts at ${startHint}`}
          style={{ fontFamily: "var(--font-body)" }}
        >
          @{startHint}
        </span>
      )}
    </span>
  );

  if (!itunesId) return <div>{chip}</div>;

  return (
    <div>
      <a
        href={appleMusicUrl(itunesId)}
        target="_blank"
        rel="noopener noreferrer"
        title={`Listen on Apple Music: ${song}`}
      >
        {chip}
      </a>
    </div>
  );
}
