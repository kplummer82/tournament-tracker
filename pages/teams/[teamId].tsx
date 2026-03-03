// pages/teams/[teamId].tsx
import { useRouter } from "next/router";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Music, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TeamDetail, TeamTournament } from "@/pages/api/teams/[teamId]";
import type { RosterRow } from "@/pages/api/teams/[teamId]/roster";
import TeamCalendarTab from "@/components/teams/TeamCalendarTab";

type TabKey = "overview" | "roster" | "calendar";

/* ─── iTunes search ──────────────────────────────────────────── */
type ItunesTrack = {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName?: string;
  artworkUrl60?: string;
};

async function searchItunes(q: string): Promise<ItunesTrack[]> {
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

function WalkupSongInput({ value, itunesId: _itunesId, onChange, onBlurCommit }: WalkupSongInputProps) {
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
      // API unavailable — silently stay as free-form
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
    // commit immediately on pick
    setTimeout(onBlurCommit, 0);
  };

  const clearSong = () => {
    setQuery("");
    setSelected(false);
    setDropdownOpen(false);
    onChange("", null);
    setTimeout(onBlurCommit, 0);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
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
            onMouseDown={(e) => { e.preventDefault(); clearSong(); }}
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
              onMouseDown={(e) => { e.preventDefault(); pickTrack(t); }}
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

/* ─── Per-player parent-view row state ──────────────────────── */
type ParentEdit = {
  hat_monogram: string;
  walkup_song: string;
  walkup_song_itunes_id: number | null;
};

/* ─── RosterTab ──────────────────────────────────────────────── */
function RosterTab({ teamId }: { teamId: string }) {
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [version, setVersion] = useState(0);
  const [parentView, setParentView] = useState(false);

  // per-player edits for parent view (keyed by roster id)
  const [parentEdits, setParentEdits] = useState<Record<number, ParentEdit>>({});

  const [first_name, setFirstName] = useState("");
  const [last_name, setLastName] = useState("");
  const [role, setRole] = useState<"player" | "staff" | "">("");
  const [jersey_number, setJerseyNumber] = useState<string>("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!teamId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(`/api/teams/${teamId}/roster`, { cache: "no-store" });
        if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`);
        const data = await res.json();
        const rows: RosterRow[] = Array.isArray(data?.roster) ? data.roster : [];
        if (!cancelled) {
          setRoster(rows);
          // Seed parent edit state from fetched data
          const edits: Record<number, ParentEdit> = {};
          rows.forEach((r) => {
            edits[r.id] = {
              hat_monogram: r.hat_monogram ?? "",
              walkup_song: r.walkup_song ?? "",
              walkup_song_itunes_id: r.walkup_song_itunes_id ?? null,
            };
          });
          setParentEdits(edits);
        }
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "Failed to load roster");
          setRoster([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [teamId, version]);

  const handleAdd = async () => {
    setSubmitError(null);
    const first = first_name.trim();
    if (!first) { setSubmitError("First name is required."); return; }
    if (role !== "player" && role !== "staff") { setSubmitError("Please choose Player or Staff."); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/roster`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: first,
          last_name: last_name.trim() || null,
          role,
          jersey_number: jersey_number === "" ? null : parseInt(jersey_number, 10),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setVersion((v) => v + 1);
      setAddOpen(false);
      setFirstName(""); setLastName(""); setRole(""); setJerseyNumber("");
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Failed to add.");
    } finally {
      setSubmitting(false);
    }
  };

  const patchRosterEntry = async (rosterId: number, patch: Partial<ParentEdit>) => {
    try {
      await fetch(`/api/teams/${teamId}/roster/${rosterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    } catch {
      // silent fail — local optimistic state already updated
    }
  };

  const updateParentEdit = (rosterId: number, patch: Partial<ParentEdit>) => {
    setParentEdits((prev) => ({
      ...prev,
      [rosterId]: { ...prev[rosterId], ...patch },
    }));
  };

  const players = roster.filter((r) => r.role === "player");
  const staff = roster.filter((r) => r.role === "staff");

  return (
    <Card>
      <CardContent className="p-6">
        {/* Header row */}
        <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
          <h2
            className="uppercase"
            style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "18px", letterSpacing: "-0.01em" }}
          >
            Roster
          </h2>
          <div className="flex items-center gap-3 ml-auto">
            {/* Team Parent View toggle */}
            <button
              type="button"
              onClick={() => setParentView((v) => !v)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] border transition-colors duration-100",
                parentView
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
              style={{ fontFamily: "var(--font-body)" }}
            >
              <span
                className={cn(
                  "inline-block h-2.5 w-4 relative border",
                  parentView ? "border-primary-foreground/40" : "border-muted-foreground/40"
                )}
              >
                <span
                  className={cn(
                    "absolute top-0 bottom-0 w-2 transition-all duration-150",
                    parentView ? "right-0 bg-primary-foreground/80" : "left-0 bg-muted-foreground/40"
                  )}
                />
              </span>
              Team Parent View
            </button>

            {/* Add person */}
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <button
                  className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-3 py-1.5 text-[11px] font-semibold tracking-[0.08em] uppercase hover:opacity-90 transition-opacity duration-100"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add person
                </button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md rounded-none">
                <DialogHeader>
                  <DialogTitle style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "18px", textTransform: "uppercase", letterSpacing: "-0.01em" }}>
                    Add to roster
                  </DialogTitle>
                  <DialogDescription style={{ fontFamily: "var(--font-body)", fontSize: "13px" }}>
                    First name and role are required. Last name and jersey are optional.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-2">
                  <div className="grid gap-2">
                    <Label htmlFor="roster-first" className="label-section">First name *</Label>
                    <Input id="roster-first" value={first_name} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="roster-last" className="label-section">Last name</Label>
                    <Input id="roster-last" value={last_name} onChange={(e) => setLastName(e.target.value)} placeholder="Last name (optional)" />
                  </div>
                  <div className="grid gap-2">
                    <Label className="label-section">Role *</Label>
                    <Select value={role} onValueChange={(v) => setRole(v as "player" | "staff")}>
                      <SelectTrigger><SelectValue placeholder="Player or Staff" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="player">Player</SelectItem>
                        <SelectItem value="staff">Staff</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="roster-jersey" className="label-section">Jersey #</Label>
                    <Input id="roster-jersey" type="number" min={0} value={jersey_number} onChange={(e) => setJerseyNumber(e.target.value)} placeholder="Optional" />
                  </div>
                  {submitError && <p className="text-sm text-destructive">{submitError}</p>}
                </div>
                <DialogFooter>
                  <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
                  <Button onClick={handleAdd} disabled={submitting}>
                    {submitting ? "Adding…" : "Add"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Parent view description */}
        {parentView && (
          <p className="text-xs text-muted-foreground mb-4" style={{ fontFamily: "var(--font-body)" }}>
            Team Parent View is on. Edit hat monograms and walk-up songs inline — changes save automatically on blur.
          </p>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading roster…</p>
        ) : err ? (
          <p className="text-sm text-destructive">{err}</p>
        ) : roster.length === 0 ? (
          <p className="text-sm text-muted-foreground">No one on the roster yet. Add players or staff above.</p>
        ) : (
          <div className="space-y-6">
            {players.length > 0 && (
              <div>
                <p
                  className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground mb-2"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  Players
                </p>
                <div className="overflow-x-auto border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-elevated">
                      <tr>
                        <th
                          className="text-left p-3 text-[10px] uppercase tracking-[0.08em] text-muted-foreground font-medium w-12"
                          style={{ fontFamily: "var(--font-body)" }}
                        >
                          #
                        </th>
                        <th
                          className="text-left p-3 text-[10px] uppercase tracking-[0.08em] text-muted-foreground font-medium"
                          style={{ fontFamily: "var(--font-body)" }}
                        >
                          Name
                        </th>
                        {parentView && (
                          <>
                            <th
                              className="text-left p-3 text-[10px] uppercase tracking-[0.08em] text-muted-foreground font-medium w-64"
                              style={{ fontFamily: "var(--font-body)" }}
                            >
                              Hat Monogram
                            </th>
                            <th
                              className="text-left p-3 text-[10px] uppercase tracking-[0.08em] text-muted-foreground font-medium min-w-[160px]"
                              style={{ fontFamily: "var(--font-body)" }}
                            >
                              Walk-up Song
                            </th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {players.map((r) => {
                        const edit = parentEdits[r.id] ?? {
                          hat_monogram: r.hat_monogram ?? "",
                          walkup_song: r.walkup_song ?? "",
                          walkup_song_itunes_id: r.walkup_song_itunes_id ?? null,
                        };
                        return (
                          <tr key={r.id} className="border-t border-border hover:bg-elevated/40 transition-colors duration-75">
                            <td
                              className="p-3 tabular-nums"
                              style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "16px" }}
                            >
                              {r.jersey_number != null ? r.jersey_number : <span className="text-muted-foreground/40 text-sm">—</span>}
                            </td>
                            <td className="p-3 font-medium">
                              {[r.first_name, r.last_name].filter(Boolean).join(" ")}
                            </td>
                            {parentView && (
                              <>
                                {/* Hat Monogram */}
                                <td className="p-2">
                                  <input
                                    type="text"
                                    value={edit.hat_monogram}
                                    maxLength={30}
                                    placeholder="e.g. SMITH"
                                    onChange={(e) =>
                                      updateParentEdit(r.id, { hat_monogram: e.target.value.toUpperCase() })
                                    }
                                    onBlur={() =>
                                      patchRosterEntry(r.id, { hat_monogram: edit.hat_monogram || null })
                                    }
                                    className={cn(
                                      "w-full px-2 py-1.5 text-xs bg-input-bg border border-border uppercase",
                                      "focus:outline-none focus:border-primary transition-colors duration-100",
                                      "placeholder:normal-case placeholder:text-muted-foreground/50"
                                    )}
                                    style={{ fontFamily: "var(--font-display)", letterSpacing: "0.06em" }}
                                  />
                                </td>
                                {/* Walk-up Song */}
                                <td className="p-2">
                                  <WalkupSongInput
                                    value={edit.walkup_song}
                                    itunesId={edit.walkup_song_itunes_id}
                                    onChange={(song, itunesId) =>
                                      updateParentEdit(r.id, {
                                        walkup_song: song,
                                        walkup_song_itunes_id: itunesId,
                                      })
                                    }
                                    onBlurCommit={() =>
                                      patchRosterEntry(r.id, {
                                        walkup_song: edit.walkup_song || null,
                                        walkup_song_itunes_id: edit.walkup_song_itunes_id,
                                      })
                                    }
                                  />
                                </td>
                              </>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {staff.length > 0 && (
              <div>
                <p
                  className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground mb-2"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  Staff
                </p>
                <ul className="border border-border divide-y divide-border">
                  {staff.map((r) => (
                    <li key={r.id} className="px-3 py-2 text-sm hover:bg-elevated/40 transition-colors duration-75">
                      {[r.first_name, r.last_name].filter(Boolean).join(" ") || r.first_name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── TeamDetailPage ─────────────────────────────────────────── */
export default function TeamDetailPage() {
  const router = useRouter();
  const teamId = router.query.teamId as string | undefined;
  const returnTo = typeof router.query.returnTo === "string" ? router.query.returnTo : undefined;
  const backHref = returnTo && returnTo.startsWith("/") && !returnTo.includes("//") ? returnTo : "/teams";
  const backLabel = backHref === "/teams" ? "Back to Teams" : "Back to tournament teams";

  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [tournaments, setTournaments] = useState<TeamTournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("overview");

  useEffect(() => {
    if (!teamId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/teams/${teamId}`, { cache: "no-store" });
        if (!res.ok) {
          if (res.status === 404) throw new Error("Team not found");
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        if (!cancelled) {
          setTeam(data.team ?? null);
          setTournaments(Array.isArray(data.tournaments) ? data.tournaments : []);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load team");
          setTeam(null);
          setTournaments([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [teamId]);

  if (router.isFallback || loading) {
    return (
      <div className="min-h-screen">
        <Header />
        <main className="p-4 sm:p-6 md:p-8 mx-auto max-w-7xl">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </main>
      </div>
    );
  }

  if (error || !team) {
    return (
      <div className="min-h-screen">
        <Header />
        <main className="p-4 sm:p-6 md:p-8 mx-auto max-w-7xl space-y-4">
          <Link href={backHref} className="text-sm text-primary hover:underline">← {backLabel}</Link>
          <Card className="border-destructive/40">
            <CardContent className="p-6 text-destructive">{error ?? "Team not found."}</CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header />
      <main className="p-4 sm:p-6 md:p-8 mx-auto max-w-7xl space-y-6">
        <Link href={backHref} className="text-sm text-primary hover:underline">
          ← {backLabel}
        </Link>

        <div>
          <h1
            className="uppercase"
            style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "28px", letterSpacing: "-0.02em", lineHeight: 1 }}
          >
            {team.name ?? "Team"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1" style={{ fontFamily: "var(--font-body)" }}>
            Details, roster, and schedule
          </p>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList className="bg-muted/60 border border-border p-1 rounded-lg">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="roster">Roster</TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6 space-y-6">
            <Card>
              <CardContent className="p-6">
                <h2 className="text-lg font-medium mb-4">Details</h2>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Division</dt>
                    <dd className="font-medium">{team.division ?? team.league_division_name ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Season</dt>
                    <dd className="font-medium">{team.season ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Year</dt>
                    <dd className="font-medium">{team.year ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Sport</dt>
                    <dd className="font-medium">{team.sport ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">League</dt>
                    <dd className="font-medium">{team.league_name ?? "—"}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <h2 className="text-lg font-medium mb-4">Tournaments</h2>
                {tournaments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">This team is not connected to any tournaments yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {tournaments.map((t) => (
                      <li key={t.tournamentid}>
                        <Link href={`/tournaments/${t.tournamentid}`} className="text-primary hover:underline font-medium">
                          {t.name ?? `Tournament #${t.tournamentid}`}
                        </Link>
                        {(t.year != null || t.division) && (
                          <span className="text-muted-foreground text-sm ml-2">
                            {[t.year, t.division].filter(Boolean).join(" · ")}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="roster" className="mt-6">
            {teamId && <RosterTab teamId={teamId} />}
          </TabsContent>

          <TabsContent value="calendar" className="mt-6">
            {teamId && <TeamCalendarTab teamId={teamId} />}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
