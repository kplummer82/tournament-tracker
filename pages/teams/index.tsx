// pages/teams/index.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Search, X, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import Header from "@/components/Header";
import CreateTeamModal from "@/components/CreateTeamModal";

/* ---------------- types ---------------- */
type Team = {
  id: number;
  name: string;
  division: string;
  season: string;
  year: number;
  sport: string;
  league_name: string | null;
};
type TeamsResponse = { rows: Team[]; total: number };
type LookupRow = { id: number; name: string };

const SEASONS = ["Spring", "Summer", "Fall", "Winter"] as const;

/* -------------- small helpers -------------- */
function useDebounced<T>(value: T, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

/* -------------- lookups -------------- */
function useLookups() {
  const [sports, setSports] = useState<LookupRow[]>([]);
  const [divisions, setDivisions] = useState<LookupRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/lookups");
        const json = await res.json();
        if (!cancelled) {
          setSports(Array.isArray(json?.sports) ? json.sports : []);
          const divs = Array.isArray(json?.divisions) ? json.divisions : [];
          const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
          setDivisions([...divs].sort((a, b) => collator.compare(a.name, b.name)));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { sports, divisions, loading };
}

/* -------------- Team row -------------- */
function TeamRow({ t }: { t: Team }) {
  return (
    <Link
      href={`/teams/${t.id}`}
      className="group flex items-center gap-4 py-4 pl-4 pr-5 border-b border-border last:border-0 hover:bg-elevated transition-colors duration-100"
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

      {/* Metadata */}
      <div
        className="hidden sm:flex items-center gap-3 text-muted-foreground shrink-0"
        style={{ fontFamily: "var(--font-body)", fontSize: "12px" }}
      >
        {t.league_name && <span>{t.league_name}</span>}
        {t.year && <span>{t.league_name ? "·\u00a0" : ""}{t.year}</span>}
        {t.season && <span>·&nbsp;{t.season}</span>}
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

      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all duration-100 shrink-0" />
    </Link>
  );
}

/* -------------- Empty state -------------- */
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
          <p
            className="text-foreground font-medium mb-1 uppercase tracking-wide text-sm"
            style={{ fontFamily: "var(--font-display)" }}
          >
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
          <p
            className="text-foreground font-medium mb-1 uppercase tracking-wide text-sm"
            style={{ fontFamily: "var(--font-display)" }}
          >
            No Teams Yet
          </p>
          <p className="text-sm text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
            Create your first team to get started.
          </p>
        </>
      )}
    </div>
  );
}

/* -------------- Pagination -------------- */
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

/* -------------- Filter state -------------- */
type FilterState = { q: string; year?: string; division?: string; season?: string; sport?: string };

/* -------------- Page -------------- */
export default function TeamsIndexPage() {
  const { divisions, sports } = useLookups();

  const [filters, setFilters] = useState<FilterState>({
    q: "", year: undefined, division: undefined, season: undefined, sport: undefined,
  });
  const pageSize = 20;
  const [page, setPage] = useState(1);
  const debouncedQ = useDebounced(filters.q, 300);

  const [data, setData] = useState<TeamsResponse>({ rows: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const controllerRef = useRef<AbortController | null>(null);
  const load = async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        q: debouncedQ,
        year: filters.year ?? "",
        division: filters.division ?? "",
        season: filters.season ?? "",
        sport: filters.sport ?? "",
        page: String(page),
        pageSize: String(pageSize),
      });
      Array.from(params.keys()).forEach((k) => !params.get(k) && params.delete(k));

      const res = await fetch(`/api/teams?${params.toString()}`, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.json();
      const json: TeamsResponse = {
        rows: Array.isArray(raw?.rows) ? raw.rows : Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [],
        total: Number(
          raw?.total ??
            (Array.isArray(raw?.rows) ? raw.rows.length : Array.isArray(raw?.data) ? raw.data.length : Array.isArray(raw) ? raw.length : 0)
        ),
      };
      setData(json);
    } catch (e: unknown) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message || "Failed to load teams");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    return () => controllerRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ, filters.year, filters.division, filters.season, filters.sport, page]);

  useEffect(() => setPage(1), [debouncedQ, filters.year, filters.division, filters.season, filters.sport]);

  const pageCount = Math.max(1, Math.ceil((Number.isFinite(data?.total) ? data.total : 0) / pageSize));
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const total = Number.isFinite(data?.total) ? (data.total as number) : 0;
  const hasFilters = !!(filters.q || filters.year || filters.division || filters.season || filters.sport);
  const activeFilterCount = [filters.year, filters.division, filters.season, filters.sport].filter(Boolean).length;

  const clearFilters = () => setFilters({ q: "", year: undefined, division: undefined, season: undefined, sport: undefined });

  const handleCreate = async (t: Partial<Team>): Promise<{ id: number }> => {
    const res = await fetch("/api/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(t),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { id } = await res.json();
    setPage(1);
    await load();
    return { id };
  };

  return (
    <div className="min-h-screen">
      <Header />

      <main className="mx-auto max-w-7xl px-4 md:px-6 py-8 space-y-6">

        {/* ── Page header ── */}
        <div className="flex items-end justify-between">
          <div>
            <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "36px", letterSpacing: "-0.02em", textTransform: "uppercase" }}>
              Teams
            </h1>
            <p className="text-muted-foreground text-sm mt-1" style={{ fontFamily: "var(--font-body)" }}>
              {loading ? "Loading…" : `${total} team${total !== 1 ? "s" : ""}`}
            </p>
          </div>
          <CreateTeamModal onCreate={handleCreate} />
        </div>

        {/* ── Filter bar ── */}
        <div className="border border-border bg-card p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            {/* Search */}
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={filters.q}
                onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
                placeholder="Search team name…"
                className="pl-9 h-8 text-sm bg-surface border-border"
              />
            </div>

            {/* Compact selects + clear */}
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={filters.year} onValueChange={(v) => setFilters((f) => ({ ...f, year: v }))}>
                <SelectTrigger className="h-7 w-[80px] text-[11px] bg-surface border-border">
                  <SelectValue placeholder="Year" />
                </SelectTrigger>
                <SelectContent>
                  {["2026", "2025", "2024", "2023", "2022"].map((y) => (
                    <SelectItem key={y} value={y} className="text-xs">{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filters.division} onValueChange={(v) => setFilters((f) => ({ ...f, division: v }))}>
                <SelectTrigger className="h-7 w-[100px] text-[11px] bg-surface border-border">
                  <SelectValue placeholder="Division" />
                </SelectTrigger>
                <SelectContent>
                  {divisions.map((d) => (
                    <SelectItem key={d.id} value={d.name} className="text-xs">{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filters.season} onValueChange={(v) => setFilters((f) => ({ ...f, season: v }))}>
                <SelectTrigger className="h-7 w-[90px] text-[11px] bg-surface border-border">
                  <SelectValue placeholder="Season" />
                </SelectTrigger>
                <SelectContent>
                  {SEASONS.map((s) => (
                    <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filters.sport} onValueChange={(v) => setFilters((f) => ({ ...f, sport: v }))}>
                <SelectTrigger className="h-7 w-[90px] text-[11px] bg-surface border-border">
                  <SelectValue placeholder="Sport" />
                </SelectTrigger>
                <SelectContent>
                  {sports.map((s) => (
                    <SelectItem key={s.id} value={s.name} className="text-xs">{s.name}</SelectItem>
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
            {rows.map((t) => <TeamRow key={t.id} t={t} />)}
          </div>
        )}

        {/* ── Footer / Pagination ── */}
        {!loading && rows.length > 0 && (
          <div className="flex items-center justify-between">
            <span
              className="text-[11px] text-muted-foreground uppercase tracking-[0.06em]"
              style={{ fontFamily: "var(--font-body)" }}
            >
              {rows.length} of {total}
            </span>
            <Pagination page={page} pageCount={pageCount} onPage={setPage} />
          </div>
        )}

      </main>
    </div>
  );
}
