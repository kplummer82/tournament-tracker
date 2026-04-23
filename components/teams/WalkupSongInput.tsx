import { useCallback, useEffect, useRef, useState } from "react";
import { Music, X } from "lucide-react";
import { cn } from "@/lib/utils";

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

export async function searchItunes(q: string): Promise<ItunesTrack[]> {
  if (!q.trim()) return [];
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=8&media=music`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("iTunes API error");
  const json = await res.json();
  return Array.isArray(json.results) ? json.results : [];
}

/* ─── WalkupSongInput ─────────────────────────────────────────── */
type WalkupSongInputProps = {
  value: string;
  itunesId: number | null;
  onChange: (song: string, itunesId: number | null) => void;
  onBlurCommit: () => void;
};

export function WalkupSongInput({ value, itunesId: _itunesId, onChange, onBlurCommit }: WalkupSongInputProps) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<ItunesTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selected, setSelected] = useState(!!_itunesId);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // sync from parent when it changes externally
  useEffect(() => {
    setQuery(value);
    setSelected(!!_itunesId);
  }, [value, _itunesId]);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); setDropdownOpen(false); return; }
    setSearching(true);
    try {
      const tracks = await searchItunes(q);
      setResults(tracks);
      setDropdownOpen(tracks.length > 0);
    } catch {
      setResults([]);
      setDropdownOpen(false);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setQuery(q);
    setSelected(false);
    onChange(q, null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(q), 400);
  };

  const pickTrack = (t: ItunesTrack) => {
    const label = `${t.trackName} — ${t.artistName}`;
    setQuery(label);
    setSelected(true);
    setDropdownOpen(false);
    onChange(label, t.trackId);
    setTimeout(onBlurCommit, 0);
  };

  const clearSong = () => {
    setQuery("");
    setSelected(false);
    setDropdownOpen(false);
    onChange("", null);
    setTimeout(onBlurCommit, 0);
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

  return (
    <div className="relative" ref={containerRef}>
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

      {dropdownOpen && results.length > 0 && (
        <div className="absolute z-50 left-0 right-0 top-full mt-0.5 bg-card border border-border shadow-lg max-h-56 overflow-y-auto">
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
  );
}

/* ─── WalkupSongLink (read-only display chip) ────────────────── */
export function WalkupSongLink({ song, itunesId }: { song: string; itunesId: number | null }) {
  const parts = song.split(" — ");
  const trackName = parts[0] || song;
  const artistName = parts.length > 1 ? parts.slice(1).join(" — ") : null;

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
