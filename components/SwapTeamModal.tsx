import * as React from "react";
import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";

type SwapTeamModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tournamentId: number;
  currentTeam: { id: number; name: string; season: string };
  onSwapped: () => void;
};

type TeamRow = {
  id: number;
  name: string;
  division?: string | null;
  season?: string | null;
  year?: number | null;
  sport?: string | null;
};

type SearchResponse = {
  rows: TeamRow[];
  total: number;
};

type Impact = { poolGames: number; bracketAssignments: number };

type TournamentInfo = Record<string, any>;

type DivisionLookup = { id: number; division: string };

function useDivisionLookups() {
  const [divisions, setDivisions] = React.useState<DivisionLookup[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/lookups");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const arr = Array.isArray(json.divisions) ? json.divisions : [];
        const norm: DivisionLookup[] = arr
          .map((d: any) => ({
            id: Number(d.id),
            division: String(d.division ?? d.name ?? "").trim(),
          }))
          .filter((d) => d.id && d.division);
        if (!cancelled) setDivisions(norm);
      } catch (e: any) {
        if (!cancelled) setError(e.message || "Failed to load divisions");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { divisions, loading, error };
}

function normalizeDivisionIdFromTournament(json: TournamentInfo, allDivs: DivisionLookup[]): number | null {
  const raw =
    json?.divisionid ??
    json?.division_id ??
    json?.divisionId ??
    json?.division ??
    null;

  if (raw == null) return null;

  const asNum = Number(raw);
  if (!Number.isNaN(asNum) && asNum > 0) return asNum;

  const label = String(raw).trim().toLowerCase();
  const hit = allDivs.find((d) => d.division.trim().toLowerCase() === label);
  return hit?.id ?? null;
}

export default function SwapTeamModal({
  open,
  onOpenChange,
  tournamentId,
  currentTeam,
  onSwapped,
}: SwapTeamModalProps) {
  const [q, setQ] = useState("");
  const [season, setSeason] = useState<string | undefined>(undefined);
  const [year, setYear] = useState<string | undefined>(undefined);
  const [sport, setSport] = useState<string | undefined>(undefined);

  const [divisionIdLocked, setDivisionIdLocked] = useState<number | null>(null);
  const [loadingDivision, setLoadingDivision] = useState(false);
  const [divisionError, setDivisionError] = useState<string | null>(null);

  const { divisions, loading: lookupsLoading, error: lookupsError } = useDivisionLookups();
  const divisionNameLocked = React.useMemo(() => {
    if (divisionIdLocked == null) return null;
    return divisions.find((d) => d.id === divisionIdLocked)?.division ?? null;
  }, [divisions, divisionIdLocked]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SearchResponse>({ rows: [], total: 0 });

  const [page, setPage] = useState(1);
  const pageSize = 12;

  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [impact, setImpact] = useState<Impact | null>(null);
  const [swapping, setSwapping] = useState(false);

  const loadImpact = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/tournaments/${tournamentId}/teams/${currentTeam.id}/impact`
      );
      if (!res.ok) return;
      const data = await res.json();
      setImpact(data);
    } catch {
      setImpact(null);
    }
  }, [tournamentId, currentTeam.id]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      try {
        setLoadingDivision(true);
        setDivisionError(null);

        const res = await fetch(`/api/tournaments/${tournamentId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as TournamentInfo;

        const ensureId = () =>
          normalizeDivisionIdFromTournament(json, divisions);

        if (lookupsLoading) {
          const interval = setInterval(() => {
            if (!lookupsLoading) {
              const id = ensureId();
              if (!cancelled) setDivisionIdLocked(id);
              clearInterval(interval);
            }
          }, 50);
        } else {
          const id = ensureId();
          if (!cancelled) setDivisionIdLocked(id);
        }
      } catch (e: any) {
        if (!cancelled) setDivisionError(e.message || "Failed to load tournament");
      } finally {
        if (!cancelled) setLoadingDivision(false);
      }
    })();

    return () => { cancelled = true; };
  }, [open, tournamentId, lookupsLoading, divisions]);

  useEffect(() => {
    if (open) {
      loadImpact();
      setSelectedTeamId(null);
      setQ("");
      setSeason(undefined);
      setYear(undefined);
      setSport(undefined);
      setPage(1);
      setError(null);
    }
  }, [open, loadImpact]);

  useEffect(() => {
    if (!open) return;
    if (divisionIdLocked == null) return;

    const controller = new AbortController();
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          q,
          page: String(page),
          pageSize: String(pageSize),
          excludetournamentid: String(tournamentId),
          divisionid: String(divisionIdLocked),
        });
        if (season) params.set("season", season);
        if (year) params.set("year", year);
        if (sport) params.set("sport", sport);

        const res = await fetch(`/api/teams/search?${params.toString()}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as SearchResponse;
        setData({
          rows: Array.isArray(json.rows) ? json.rows : [],
          total: Number(json.total ?? 0),
        });
      } catch (e: any) {
        if (e.name !== "AbortError") setError(e.message || "Failed to load teams");
      } finally {
        setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [open, q, season, year, sport, page, tournamentId, divisionIdLocked]);

  const clearFilters = () => {
    setQ("");
    setSeason(undefined);
    setYear(undefined);
    setSport(undefined);
    setPage(1);
  };

  const handleSwap = async () => {
    if (!selectedTeamId) return;
    setSwapping(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/tournaments/${tournamentId}/teams/${currentTeam.id}/swap`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newTeamId: selectedTeamId }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      onSwapped();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to swap team");
    } finally {
      setSwapping(false);
    }
  };

  const pageCount = Math.max(1, Math.ceil((data?.total || 0) / pageSize));
  const selectedTeam = data.rows.find((t) => t.id === selectedTeamId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="2xl" className="w-[min(92vw,72rem)] max-w-[72rem]">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "var(--font-display)", textTransform: "uppercase" }}>
            Swap Team
          </DialogTitle>
          <DialogDescription style={{ fontFamily: "var(--font-body)" }}>
            Replace {currentTeam.name} with a different team. All pool games and bracket
            assignments will be updated.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2">
            <Label className="label-section">Current Team</Label>
            <div className="px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm">
              <span className="font-medium" style={{ fontFamily: "var(--font-body)" }}>
                {currentTeam.name}
              </span>
              <span className="text-muted-foreground text-xs ml-2">
                {currentTeam.season}
              </span>
            </div>
          </div>

          <div className="grid gap-3">
            <Label className="label-section">Replace With</Label>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by team name…"
                className="sm:w-[320px]"
              />

              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  Division:&nbsp;
                  {loadingDivision || lookupsLoading
                    ? "Loading…"
                    : divisionNameLocked ?? (divisionIdLocked != null ? `#${divisionIdLocked}` : "Unknown")}
                </Badge>
                {(divisionError || lookupsError) && (
                  <span className="text-sm text-destructive">
                    {divisionError || lookupsError}
                  </span>
                )}
              </div>

              <Select value={season} onValueChange={(v) => { setSeason(v); setPage(1); }}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Season" />
                </SelectTrigger>
                <SelectContent>
                  {["Spring","Summer","Fall","Winter"].map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={year} onValueChange={(v) => { setYear(v); setPage(1); }}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="Year" />
                </SelectTrigger>
                <SelectContent>
                  {["2025","2024","2023","2022"].map((y) => (
                    <SelectItem key={y} value={y}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={sport} onValueChange={(v) => { setSport(v); setPage(1); }}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Sport" />
                </SelectTrigger>
                <SelectContent>
                  {["Baseball","Softball","Boys Baseball","Girls Softball"].map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button variant="secondary" onClick={clearFilters}>Clear</Button>
            </div>

            <div className="rounded-xl border overflow-x-auto">
              {divisionIdLocked == null ? (
                <div className="p-4 text-sm text-muted-foreground">Loading tournament division…</div>
              ) : error ? (
                <div className="p-4 text-destructive text-sm">{error}</div>
              ) : loading ? (
                <div className="p-4 text-sm text-muted-foreground">Loading…</div>
              ) : data?.rows?.length ? (
                <div className="min-w-[56rem]">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/60">
                      <tr>
                        <th className="p-3 text-left font-medium">Select</th>
                        <th className="p-3 text-left font-medium">Name</th>
                        <th className="p-3 text-left font-medium">Division</th>
                        <th className="p-3 text-left font-medium">Season</th>
                        <th className="p-3 text-left font-medium">Year</th>
                        <th className="p-3 text-left font-medium">Sport</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.map((t) => {
                        const isSelected = selectedTeamId === t.id;
                        return (
                          <tr 
                            key={t.id} 
                            className={`border-b last:border-b-0 cursor-pointer transition-colors ${
                              isSelected ? "bg-primary/10" : "hover:bg-muted/50"
                            }`}
                            onClick={() => setSelectedTeamId(t.id)}
                          >
                            <td className="p-3">
                              <Button
                                variant={isSelected ? "default" : "outline"}
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedTeamId(t.id);
                                }}
                              >
                                {isSelected ? "Selected" : "Select"}
                              </Button>
                            </td>
                            <td className="p-3 font-medium">{t.name}</td>
                            <td className="p-3">{t.division}</td>
                            <td className="p-3">{t.season}</td>
                            <td className="p-3">{t.year ?? ""}</td>
                            <td className="p-3">{t.sport}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-4 text-sm text-muted-foreground">
                  {divisionNameLocked
                    ? `No ${divisionNameLocked} teams match your filters.`
                    : "No teams match your filters."}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                {data?.rows?.length ?? 0} shown {selectedTeam && `• Selected: ${selectedTeam.name}`}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Prev
                </Button>
                <div className="text-sm">
                  Page <b>{page}</b> / <b>{Math.max(1, pageCount)}</b>
                </div>
                <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          </div>

          {selectedTeam && impact && (
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-1">
              <p className="text-xs font-medium text-foreground" style={{ fontFamily: "var(--font-display)" }}>
                This will update:
              </p>
              <ul className="text-xs text-muted-foreground space-y-0.5" style={{ fontFamily: "var(--font-body)" }}>
                {impact.poolGames > 0 && <li>• {impact.poolGames} pool game{impact.poolGames !== 1 ? "s" : ""}</li>}
                {impact.bracketAssignments > 0 && (
                  <li>• {impact.bracketAssignments} bracket assignment{impact.bracketAssignments !== 1 ? "s" : ""}</li>
                )}
                {impact.poolGames === 0 && impact.bracketAssignments === 0 && (
                  <li className="text-muted-foreground/70">No games or assignments to update</li>
                )}
              </ul>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={swapping}>
            Cancel
          </Button>
          <Button onClick={handleSwap} disabled={!selectedTeamId || swapping}>
            {swapping ? "Swapping…" : "Swap Team"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
