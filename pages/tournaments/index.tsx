// pages/tournaments/index.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Search, X, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import Header from "@/components/Header";
import CreateTournamentModal, {
  type CreateTournamentDuplicateError,
} from "@/components/CreateTournamentModal";

// ─── Types ────────────────────────────────────────────────
type Tournament = {
  id: number;
  name: string;
  city?: string;
  state?: string;
  year: number;
  division?: string;
  status?: "Draft" | "Active" | "Completed" | "Archived" | string;
  visibility?: "Private" | "Public" | string;
  sport?: string;
  maxrundiff?: number | null;
  createdAt: string;
  team_count?: number | null;
  total_games?: number | null;
  final_games?: number | null;
};
type TournamentsResponse = { rows: Tournament[]; total: number };
type FilterState = {
  q: string;
  year: string | undefined;
  division: string | undefined;
  status: string | undefined;
  visibility: string | undefined;
};

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string; left: string }> = {
  Active:    { bg: "#00c85318", text: "#00c853", border: "#00c85340", left: "#00c853" },
  Draft:     { bg: "#5a5a5a18", text: "#5a5a5a", border: "#5a5a5a40", left: "#5a5a5a" },
  Completed: { bg: "#ffe50018", text: "#ffe500", border: "#ffe50040", left: "#ffe500" },
  Archived:  { bg: "#3a3a3a18", text: "#3a3a3a", border: "#3a3a3a40", left: "#3a3a3a" },
};
const STATUSES = ["Active", "Draft", "Completed", "Archived"] as const;

function useDebounced<T>(value: T, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

function matchesFilters(t: Tournament, filters: FilterState, q: string) {
  const needle = (q || "").trim().toLowerCase();
  if (needle) {
    const hay = [t.name, t.city, t.state].filter(Boolean).join(" ").toLowerCase();
    if (!hay.includes(needle)) return false;
  }
  if (filters.year && String(t.year) !== filters.year) return false;
  if (filters.division && (t.division ?? "").toLowerCase() !== filters.division.toLowerCase()) return false;
  if (filters.status && (t.status ?? "").toLowerCase() !== filters.status.toLowerCase()) return false;
  if (filters.visibility && (t.visibility ?? "").toLowerCase() !== filters.visibility.toLowerCase()) return false;
  return true;
}

// ─── Tournament row ────────────────────────────────────────
function TournamentRow({ t }: { t: Tournament }) {
  const sc = STATUS_COLORS[t.status ?? ""] ?? STATUS_COLORS.Draft;
  return (
    <Link
      href={`/tournaments/${t.id}`}
      className="group flex items-center gap-4 py-4 pl-4 pr-5 border-b border-border last:border-0 hover:bg-elevated transition-colors duration-100 relative"
      style={{ borderLeft: `3px solid ${sc.left}` }}
    >
      {/* Name */}
      <span
        className="flex-1 min-w-0 truncate text-foreground group-hover:text-primary transition-colors duration-100"
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: "17px",
          textTransform: "uppercase",
          letterSpacing: "-0.01em",
        }}
      >
        {t.name}
      </span>

      {/* Meta */}
      <div
        className="hidden sm:flex items-center gap-3 text-muted-foreground shrink-0"
        style={{ fontFamily: "var(--font-body)", fontSize: "12px" }}
      >
        {(t.city || t.state) && (
          <span>{[t.city, t.state].filter(Boolean).join(", ")}</span>
        )}
        {t.year && <span>·&nbsp;{t.year}</span>}
        {(t.team_count ?? 0) > 0 && <span>·&nbsp;{t.team_count} teams</span>}
        {(t.total_games ?? 0) > 0 && (
          <span>·&nbsp;{t.final_games ?? 0}/{t.total_games} final</span>
        )}
        {t.division && (
          <span className="border border-border/60 px-2 py-0.5 text-[10px] uppercase tracking-wider">
            {t.division}
          </span>
        )}
        {t.sport && (
          <span className="border border-border/60 px-2 py-0.5 text-[10px] uppercase tracking-wider">
            {t.sport}
          </span>
        )}
      </div>

      {/* Status */}
      {t.status && (
        <span
          className="badge shrink-0"
          style={{ background: sc.bg, color: sc.text, borderColor: sc.border }}
        >
          {t.status}
        </span>
      )}

      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all duration-100 shrink-0" />
    </Link>
  );
}

// ─── Empty state ───────────────────────────────────────────
function EmptyState({ hasFilters, onClear }: { hasFilters: boolean; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <span
        className="text-[96px] leading-none text-border select-none mb-4"
        style={{ fontFamily: "var(--font-display)", fontWeight: 800 }}
      >
        0
      </span>
      {hasFilters ? (
        <>
          <p className="text-foreground font-medium mb-1 uppercase tracking-wide text-sm" style={{ fontFamily: "var(--font-display)" }}>
            No matches
          </p>
          <p className="text-sm text-muted-foreground mb-4" style={{ fontFamily: "var(--font-body)" }}>
            Try adjusting your filters.
          </p>
          <button
            type="button"
            onClick={onClear}
            className="text-[11px] tracking-[0.1em] uppercase text-primary hover:opacity-80 transition-opacity border border-primary/40 px-4 py-2"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Clear filters
          </button>
        </>
      ) : (
        <>
          <p className="text-foreground font-medium mb-1 uppercase tracking-wide text-sm" style={{ fontFamily: "var(--font-display)" }}>
            No Tournaments Yet
          </p>
          <p className="text-sm text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
            Create your first tournament to get started.
          </p>
        </>
      )}
    </div>
  );
}

// ─── Pagination ────────────────────────────────────────────
function Pagination({ page, pageCount, onPage }: { page: number; pageCount: number; onPage: (p: number) => void }) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        className="h-7 w-7 flex items-center justify-center border border-border text-muted-foreground disabled:opacity-30 hover:border-primary hover:text-primary transition-colors duration-100"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      <span
        className="text-[11px] tracking-[0.06em] uppercase text-muted-foreground"
        style={{ fontFamily: "var(--font-body)" }}
      >
        {page} / {pageCount}
      </span>
      <button
        type="button"
        disabled={page >= pageCount}
        onClick={() => onPage(page + 1)}
        className="h-7 w-7 flex items-center justify-center border border-border text-muted-foreground disabled:opacity-30 hover:border-primary hover:text-primary transition-colors duration-100"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────
type TournamentApiRow = Tournament & {
  divisionid?: number | null;
  sportid?: number | null;
  statusid?: number | null;
  visibilityid?: number | null;
};

export default function UnifiedTournamentsPage() {
  const router = useRouter();
  const [filters, setFilters] = useState<FilterState>({
    q: "", year: undefined, division: undefined, status: undefined, visibility: undefined,
  });
  const [tab, setTab] = useState<"all" | "mine">("all");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createInitialValues, setCreateInitialValues] = useState<Partial<Record<string, unknown>> | undefined>(undefined);
  const [duplicateError, setDuplicateError] = useState<CreateTournamentDuplicateError | null>(null);

  // URL → state
  useEffect(() => {
    if (!router.isReady) return;
    const { q, year, division, status, visibility, tab: t, page: p, cloneFrom } = router.query;
    setFilters({
      q: (q as string) ?? "",
      year: (year as string) || undefined,
      division: (division as string) || undefined,
      status: (status as string) || undefined,
      visibility: (visibility as string) || undefined,
    });
    setTab((t as "mine" | "all") === "mine" ? "mine" : "all");
    setPage(p ? Math.max(1, parseInt(p as string, 10)) : 1);
    if (cloneFrom) {
      const id = parseInt(String(cloneFrom), 10);
      if (Number.isFinite(id)) {
        setCreateModalOpen(true);
        fetch(`/api/tournaments/${id}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((t: TournamentApiRow | null) => {
            if (t) setCreateInitialValues({
              name: t.name ? `${t.name} (copy)` : "",
              city: t.city ?? "", state: t.state ?? "", year: t.year ?? new Date().getFullYear(),
              divisionId: t.divisionid != null ? String(t.divisionid) : "",
              sportId: t.sportid != null ? String(t.sportid) : "",
              statusId: t.statusid != null ? String(t.statusid) : "",
              visibilityId: t.visibilityid != null ? String(t.visibilityid) : "",
              maxrundiff: t.maxrundiff ?? null,
            });
          })
          .catch(() => setCreateInitialValues(undefined));
      }
    }
  }, [router.isReady, router.query.cloneFrom]);

  // state → URL
  useEffect(() => {
    const query: Record<string, string> = {};
    if (filters.q) query.q = filters.q;
    if (filters.year) query.year = filters.year;
    if (filters.division) query.division = filters.division;
    if (filters.status) query.status = filters.status;
    if (filters.visibility) query.visibility = filters.visibility;
    if (tab !== "all") query.tab = tab;
    if (page > 1) query.page = String(page);
    if (router.query.cloneFrom) query.cloneFrom = String(router.query.cloneFrom);
    router.replace({ pathname: "/tournaments", query }, undefined, { shallow: true });
  }, [filters, tab, page, router.query.cloneFrom]);

  const debouncedQ = useDebounced(filters.q, 300);
  const [data, setData] = useState<TournamentsResponse>({ rows: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      setLoading(true); setError(null);
      try {
        const params = new URLSearchParams({
          q: debouncedQ, year: filters.year ?? "", division: filters.division ?? "",
          status: filters.status ?? "", visibility: filters.visibility ?? "",
          tab, page: String(page), pageSize: String(pageSize),
        });
        Array.from(params.keys()).forEach((k) => { if (!params.get(k)) params.delete(k); });
        const res = await fetch(`/api/tournaments?${params}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = await res.json();
        setData({ rows: Array.isArray(raw?.rows) ? raw.rows : [], total: Number(raw?.total ?? 0) });
      } catch (e: unknown) {
        if ((e as Error).name !== "AbortError") setError((e as Error).message || "Failed to load");
      } finally { setLoading(false); }
    })();
    return () => controller.abort();
  }, [debouncedQ, filters.year, filters.division, filters.status, filters.visibility, tab, page]);

  const handleCreate = async (t: Partial<Tournament> & Record<string, unknown>) => {
    setDuplicateError(null);
    const res = await fetch("/api/tournaments", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(t),
    });
    if (res.status === 409) {
      const d = await res.json();
      setDuplicateError({ message: d.error ?? "A tournament with this name and year already exists.", existingId: d.existingId });
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const created: Tournament = await res.json();
    setCreateModalOpen(false); setDuplicateError(null); setCreateInitialValues(undefined);
    if (router.query.cloneFrom) router.replace({ pathname: "/tournaments", query: { ...router.query, cloneFrom: undefined } }, undefined, { shallow: true });
    if (matchesFilters(created, filters, debouncedQ)) {
      setData((prev) => ({ rows: [created, ...(prev?.rows ?? [])].slice(0, pageSize), total: (prev?.total ?? 0) + 1 }));
    }
    setPage(1);
  };

  const handleCreateModalOpenChange = (open: boolean) => {
    setCreateModalOpen(open);
    if (!open) {
      setDuplicateError(null); setCreateInitialValues(undefined);
      if (router.query.cloneFrom) router.replace({ pathname: "/tournaments", query: { ...router.query, cloneFrom: undefined } }, undefined, { shallow: true });
    }
  };

  useEffect(() => { setPage(1); }, [filters.year, filters.division, filters.status, filters.visibility, tab, debouncedQ]);

  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize));
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const total = data?.total ?? 0;
  const hasFilters = !!(filters.q || filters.year || filters.division || filters.status || filters.visibility);
  const activeFilterCount = useMemo(() => [filters.year, filters.division, filters.status, filters.visibility].filter(Boolean).length, [filters]);
  const clearFilters = () => setFilters({ q: "", year: undefined, division: undefined, status: undefined, visibility: undefined });

  return (
    <div className="min-h-screen">
      <Header />

      <main className="mx-auto max-w-7xl px-6 py-8 space-y-6">

        {/* ── Page header ── */}
        <div className="flex items-end justify-between">
          <div>
            <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "36px", letterSpacing: "-0.02em", textTransform: "uppercase" }}>
              Tournaments
            </h1>
            <p className="text-muted-foreground text-sm mt-1" style={{ fontFamily: "var(--font-body)" }}>
              {loading ? "Loading…" : `${total} tournament${total !== 1 ? "s" : ""}`}
            </p>
          </div>
          <CreateTournamentModal
            onCreate={handleCreate}
            open={createModalOpen}
            onOpenChange={handleCreateModalOpenChange}
            initialValues={createInitialValues}
            duplicateError={duplicateError}
            showTrigger={!router.query.cloneFrom}
          />
        </div>

        {/* ── Filter bar ── */}
        <div className="border border-border bg-card p-4 space-y-3">
          {/* Search + view toggle */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={filters.q}
                onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
                placeholder="Search name, city, state…"
                className="pl-9 h-8 text-sm bg-surface border-border"
              />
            </div>
            {/* View toggle */}
            <div className="flex border border-border overflow-hidden text-[11px]">
              {(["all", "mine"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setTab(v)}
                  className={cn(
                    "px-4 py-1.5 font-medium uppercase tracking-[0.08em] transition-colors duration-100",
                    tab === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground bg-surface"
                  )}
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  {v === "all" ? "All" : "Mine"}
                </button>
              ))}
            </div>
          </div>

          {/* Status segmented control + advanced */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="label-section mr-1">Status</span>
            <div className="flex border border-border overflow-hidden">
              {STATUSES.map((s) => {
                const active = filters.status === s;
                const sc = STATUS_COLORS[s];
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setFilters((f) => ({ ...f, status: active ? undefined : s }))}
                    className="px-3 py-1 text-[10px] tracking-[0.1em] uppercase transition-colors duration-100 border-r border-border last:border-0"
                    style={{
                      fontFamily: "var(--font-body)",
                      background: active ? sc.text : "transparent",
                      color: active ? "#0c0c0c" : sc.text,
                    }}
                  >
                    {s}
                  </button>
                );
              })}
            </div>

            <div className="ml-auto flex items-center gap-2">
              <Select value={filters.year} onValueChange={(v) => setFilters((f) => ({ ...f, year: v }))}>
                <SelectTrigger className="h-7 w-[80px] text-[11px] bg-surface border-border">
                  <SelectValue placeholder="Year" />
                </SelectTrigger>
                <SelectContent>
                  {["2026","2025","2024","2023","2022"].map((y) => (
                    <SelectItem key={y} value={y} className="text-xs">{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filters.division} onValueChange={(v) => setFilters((f) => ({ ...f, division: v }))}>
                <SelectTrigger className="h-7 w-[90px] text-[11px] bg-surface border-border">
                  <SelectValue placeholder="Division" />
                </SelectTrigger>
                <SelectContent>
                  {["6U","7U","8U","9U","10U","11U","12U","13U","14U","HS"].map((d) => (
                    <SelectItem key={d} value={d} className="text-xs">{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-[11px] tracking-[0.06em] uppercase text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors duration-100"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  <X className="h-3 w-3" />
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Results ── */}
        {error ? (
          <div className="border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive" style={{ fontFamily: "var(--font-body)" }}>
            {error}
          </div>
        ) : loading ? (
          <div className="border border-border bg-card divide-y divide-border">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-[56px] animate-pulse bg-surface" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState hasFilters={hasFilters} onClear={clearFilters} />
        ) : (
          <div className="border border-border bg-card">
            {rows.map((t) => <TournamentRow key={t.id} t={t} />)}
          </div>
        )}

        {/* ── Footer / Pagination ── */}
        {!loading && rows.length > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground uppercase tracking-[0.06em]" style={{ fontFamily: "var(--font-body)" }}>
              {rows.length} of {total}
            </span>
            <Pagination page={page} pageCount={pageCount} onPage={setPage} />
          </div>
        )}
      </main>
    </div>
  );
}
