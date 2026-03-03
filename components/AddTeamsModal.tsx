// components/AddTeamsModal.tsx
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";

type TeamRow = {
  id: number;
  name: string;
  division?: string | null;  // textual label from your query/join
  season?: string | null;
  year?: number | null;
  sport?: string | null;
};

type SearchResponse = {
  rows: TeamRow[];
  total: number;
};

type TournamentInfo = Record<string, any>; // we’ll be defensive about field names

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

export default function AddTeamsModal({
  tournamentid,
  onAdded,
  triggerClassName,
}: {
  tournamentid: number;
  onAdded?: () => void;
  triggerClassName?: string;
}) {
  const [open, setOpen] = React.useState(false);

  // user filters (division is locked; not shown)
  const [q, setQ] = React.useState("");
  const [season, setSeason] = React.useState<string | undefined>(undefined);
  const [year, setYear] = React.useState<string | undefined>(undefined);
  const [sport, setSport] = React.useState<string | undefined>(undefined);

  // locked division id
  const [divisionIdLocked, setDivisionIdLocked] = React.useState<number | null>(null);
  const [loadingDivision, setLoadingDivision] = React.useState(false);
  const [divisionError, setDivisionError] = React.useState<string | null>(null);

  const { divisions, loading: lookupsLoading, error: lookupsError } = useDivisionLookups();
  const divisionNameLocked = React.useMemo(() => {
    if (divisionIdLocked == null) return null;
    return divisions.find((d) => d.id === divisionIdLocked)?.division ?? null;
  }, [divisions, divisionIdLocked]);

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<SearchResponse>({ rows: [], total: 0 });

  const [page, setPage] = React.useState(1);
  const pageSize = 12;

  const [selected, setSelected] = React.useState<Record<number, boolean>>({});
  const selectedIds = React.useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([k]) => Number(k)),
    [selected]
  );

  // --- helpers ---------------------------------------------------------------

  function normalizeDivisionIdFromTournament(json: TournamentInfo, allDivs: DivisionLookup[]): number | null {
    // Try common keys: divisionid, division_id, divisionId, division
    const raw =
      json?.divisionid ??
      json?.division_id ??
      json?.divisionId ??
      json?.division ??
      null;

    if (raw == null) return null;

    // If numeric or numeric string -> use directly
    const asNum = Number(raw);
    if (!Number.isNaN(asNum) && asNum > 0) return asNum;

    // Otherwise treat as a label like "9u" and map to id
    const label = String(raw).trim().toLowerCase();
    const hit = allDivs.find((d) => d.division.trim().toLowerCase() === label);
    return hit?.id ?? null;
  }

  // --------------------------------------------------------------------------

  // Fetch tournament when the modal opens, then resolve a numeric division id.
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      try {
        setLoadingDivision(true);
        setDivisionError(null);

        const res = await fetch(`/api/tournaments/${tournamentid}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as TournamentInfo;

        // If lookups aren’t ready yet and we might need them to map a name -> id,
        // wait until they’re loaded, then resolve.
        const ensureId = () =>
          normalizeDivisionIdFromTournament(json, divisions);

        if (lookupsLoading) {
          // poll once lookups are ready (simple micro-queue)
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
  }, [open, tournamentid, lookupsLoading, divisions]);

  // Search teams — only after we know divisionIdLocked
  React.useEffect(() => {
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
          excludetournamentid: String(tournamentid),
          divisionid: String(divisionIdLocked), // ← numeric FK filter
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
  }, [open, q, season, year, sport, page, tournamentid, divisionIdLocked]);

  const clearFilters = () => {
    setQ("");
    setSeason(undefined);
    setYear(undefined);
    setSport(undefined);
    setPage(1);
  };

  const toggle = (id: number) => setSelected((s) => ({ ...s, [id]: !s[id] }));

  const addSelected = async () => {
    if (selectedIds.length === 0) return;
    const res = await fetch(`/api/tournaments/${tournamentid}/teams`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamIds: selectedIds }),
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      throw new Error(msg || `HTTP ${res.status}`);
    }
    setSelected({});
    setOpen(false);
    onAdded?.();
  };

  const pageCount = Math.max(1, Math.ceil((data?.total || 0) / pageSize));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className={triggerClassName}>Add Teams</Button>
      </DialogTrigger>

      <DialogContent size="2xl" className="w-[min(92vw,72rem)] max-w-[72rem]">
        <DialogHeader>
          <DialogTitle>Add existing teams to this tournament</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
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

            {/* Locked division badge */}
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

          {/* Results */}
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
                      const checked = !!selected[t.id];
                      return (
                        <tr key={t.id} className="border-b last:border-b-0">
                          <td className="p-3">
                            <Button
                              variant={checked ? "default" : "outline"}
                              size="sm"
                              onClick={() => toggle(t.id)}
                              className="gap-2"
                            >
                              <Check className="h-4 w-4" />
                              {checked ? "Selected" : "Select"}
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

          {/* Pagination + Selected count */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {data?.rows?.length ?? 0} shown • <Badge variant="secondary">{selectedIds.length}</Badge> selected
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

        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={selectedIds.length === 0} onClick={addSelected}>
            Add {selectedIds.length} {selectedIds.length === 1 ? "Team" : "Teams"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
