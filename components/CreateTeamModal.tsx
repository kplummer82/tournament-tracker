// components/CreateTeamModal.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";

type LookupRow = { id: number; name: string };

type TeamCreatePayload = {
  name: string;
  year: number;
  season: string;
  divisionId?: number;
  division?: string;
  sportId?: number;
  sport?: string;
  leagueId?: number;
  leagueDivisionId?: number;
};

const SEASONS = ["Spring", "Summer", "Fall", "Winter"] as const;

type LeagueRow = { id: number; name: string; abbreviation?: string | null };
type LeagueDivisionRow = { id: number; name: string; age_range?: string | null };

function useLookups() {
  const [sports, setSports] = useState<LookupRow[]>([]);
  const [divisions, setDivisions] = useState<LookupRow[]>([]);
  const [leagues, setLeagues] = useState<LeagueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [lookupsRes, leaguesRes] = await Promise.all([
          fetch("/api/lookups"),
          fetch("/api/leagues"),
        ]);
        if (!lookupsRes.ok) throw new Error(`HTTP ${lookupsRes.status}`);
        const json = await lookupsRes.json();
        const leaguesJson = leaguesRes.ok ? await leaguesRes.json() : { rows: [] };
        if (!cancelled) {
          setSports(Array.isArray(json.sports) ? json.sports : []);
          const divs = Array.isArray(json.divisions) ? json.divisions : [];
          const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
          setDivisions([...divs].sort((a, b) => collator.compare(a.name, b.name)));
          setLeagues(Array.isArray(leaguesJson.rows) ? leaguesJson.rows : []);
        }
      } catch (e: unknown) {
        if (!cancelled) setError((e as Error).message || "Failed to load lookups");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { sports, divisions, leagues, loading, error };
}

export default function CreateTeamModal({
  onCreate,
}: {
  onCreate: (payload: Partial<TeamCreatePayload>) => Promise<{ id: number }>;
}) {
  const router = useRouter();
  const { sports, divisions, leagues, loading, error } = useLookups();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [season, setSeason] = useState<string>("");
  const [leagueId, setLeagueId] = useState<string>("");
  const [divisionId, setDivisionId] = useState<string>("");
  const [sportId, setSportId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // League-specific divisions, loaded on demand
  const [leagueDivisions, setLeagueDivisions] = useState<LeagueDivisionRow[]>([]);
  const [leagueDivisionsLoading, setLeagueDivisionsLoading] = useState(false);

  const isLeagueTeam = leagueId && leagueId !== "__none__";

  // When the league selection changes, fetch that league's divisions and reset divisionId
  useEffect(() => {
    setDivisionId("");
    if (!isLeagueTeam) {
      setLeagueDivisions([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLeagueDivisionsLoading(true);
      try {
        const res = await fetch(`/api/leagues/${leagueId}/divisions`);
        const data = res.ok ? await res.json() : { rows: [] };
        if (!cancelled) {
          const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
          const rows: LeagueDivisionRow[] = Array.isArray(data.rows) ? data.rows : [];
          setLeagueDivisions([...rows].sort((a, b) => collator.compare(a.name, b.name)));
        }
      } catch {
        if (!cancelled) setLeagueDivisions([]);
      } finally {
        if (!cancelled) setLeagueDivisionsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [leagueId, isLeagueTeam]);

  const selectedDivision = useMemo(
    () => divisions.find((d) => String(d.id) === divisionId),
    [divisions, divisionId]
  );
  const selectedSport = useMemo(
    () => sports.find((s) => String(s.id) === sportId),
    [sports, sportId]
  );

  const resetForm = () => {
    setName("");
    setYear(new Date().getFullYear());
    setSeason("");
    setLeagueId("");
    setDivisionId("");
    setSportId("");
    setLeagueDivisions([]);
  };

  const buildPayload = (): TeamCreatePayload | null => {
    if (!name || !year || !season || !divisionId || !sportId) return null;
    const base = {
      name,
      year,
      season,
      sportId: Number(sportId),
      sport: selectedSport?.name,
    };
    if (isLeagueTeam) {
      return {
        ...base,
        leagueId: Number(leagueId),
        leagueDivisionId: Number(divisionId),
      };
    }
    return {
      ...base,
      divisionId: Number(divisionId),
      division: selectedDivision?.name,
    };
  };

  /** "Create" — save then navigate to the new team's page */
  const handleCreate = async () => {
    const payload = buildPayload();
    if (!payload) return;
    setSubmitting(true);
    try {
      const { id } = await onCreate(payload);
      setOpen(false);
      resetForm();
      router.push(`/teams/${id}`);
    } finally {
      setSubmitting(false);
    }
  };

  /** "Create and Add Another" — save then reset form, keep modal open */
  const handleCreateAndAddAnother = async () => {
    const payload = buildPayload();
    if (!payload) return;
    setSubmitting(true);
    try {
      await onCreate(payload);
      resetForm();
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = !!(name && year && season && divisionId && sportId);

  // Division picker is disabled while league divisions are loading, or while global lookups load
  const divisionDisabled = loading || (!!isLeagueTeam && leagueDivisionsLoading);
  const divisionPlaceholder = loading
    ? "Loading…"
    : isLeagueTeam && leagueDivisionsLoading
    ? "Loading…"
    : isLeagueTeam && leagueDivisions.length === 0 && !leagueDivisionsLoading
    ? "No divisions in this league"
    : "Select";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-3 py-1.5 text-[11px] font-semibold tracking-[0.08em] uppercase hover:opacity-90 transition-opacity duration-100"
          style={{ fontFamily: "var(--font-body)" }}
        >
          <Plus className="h-3.5 w-3.5" />
          New Team
        </button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg rounded-none">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "20px", textTransform: "uppercase", letterSpacing: "-0.01em" }}>
            Create Team
          </DialogTitle>
          <DialogDescription style={{ fontFamily: "var(--font-body)", fontSize: "13px" }}>
            Enter the team details to add them to your roster.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Failed to load options: {error}
          </div>
        ) : null}

        <div className="grid gap-4 py-2">
          {/* Team Name */}
          <div className="grid gap-2">
            <Label htmlFor="team-name" className="label-section">Team name</Label>
            <Input
              id="team-name"
              placeholder="e.g., Westside Wolves"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Year / Season */}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label className="label-section">Year</Label>
              <Input
                type="number"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              />
            </div>
            <div className="grid gap-2">
              <Label className="label-section">Season</Label>
              <Select value={season} onValueChange={setSeason}>
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {SEASONS.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* League — comes before Division */}
          <div className="grid gap-2">
            <Label className="label-section">
              League <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Select value={leagueId} onValueChange={setLeagueId} disabled={loading}>
              <SelectTrigger>
                <SelectValue placeholder={loading ? "Loading…" : "None (independent)"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None (independent)</SelectItem>
                {leagues.map((l) => (
                  <SelectItem key={l.id} value={String(l.id)}>
                    {l.abbreviation ? `${l.abbreviation} – ${l.name}` : l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Division / Sport */}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label className="label-section">Division</Label>
              <Select
                value={divisionId}
                onValueChange={setDivisionId}
                disabled={divisionDisabled}
              >
                <SelectTrigger>
                  <SelectValue placeholder={divisionPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {isLeagueTeam
                    ? leagueDivisions.map((d) => (
                        <SelectItem key={d.id} value={String(d.id)}>
                          {d.age_range ? `${d.name} (${d.age_range})` : d.name}
                        </SelectItem>
                      ))
                    : divisions.map((d) => (
                        <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                      ))
                  }
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label className="label-section">Sport</Label>
              <Select value={sportId} onValueChange={setSportId} disabled={loading}>
                <SelectTrigger>
                  <SelectValue placeholder={loading ? "Loading…" : "Select"} />
                </SelectTrigger>
                <SelectContent>
                  {sports.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 flex-wrap sm:flex-nowrap">
          <button
            type="button"
            onClick={() => { setOpen(false); resetForm(); }}
            className="px-4 py-2 text-[11px] uppercase tracking-[0.08em] border border-border text-muted-foreground hover:text-foreground transition-colors duration-100"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreateAndAddAnother}
            disabled={submitting || loading || !canSubmit}
            className="px-4 py-2 text-[11px] uppercase tracking-[0.08em] border border-primary text-primary hover:bg-primary/10 disabled:opacity-40 transition-colors duration-100"
            style={{ fontFamily: "var(--font-body)" }}
          >
            {submitting ? "Saving…" : "Create and Add Another"}
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={submitting || loading || !canSubmit}
            className="px-4 py-2 text-[11px] uppercase tracking-[0.08em] bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-opacity duration-100"
            style={{ fontFamily: "var(--font-body)" }}
          >
            {submitting ? "Saving…" : "Create"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
