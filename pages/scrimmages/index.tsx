"use client";

import React, { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import Header from "@/components/Header";
import ListingCard, { type ListingRow } from "@/components/scrimmages/ListingCard";
import CreateListingModal from "@/components/scrimmages/CreateListingModal";
import ZipRadiusFilter, { type ZipRadiusValue } from "@/components/scrimmages/ZipRadiusFilter";
import ViewToggle, { type ScrimmageView } from "@/components/scrimmages/ViewToggle";
import ScrimmageMap from "@/components/scrimmages/ScrimmageMap";
import Link from "next/link";
import { usePermissions } from "@/lib/hooks/usePermissions";

/* -------------- helpers -------------- */

function useDebounced<T>(value: T, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

type ListingType = "all" | "hosting" | "traveling";
type SortKey = "date_asc" | "posted_desc" | "distance_asc";

type FilterState = {
  q: string;
  sport?: string;
  date_from?: string;
  date_to?: string;
  age_min?: string;
  age_max?: string;
  scope?: string;
  bats?: number[];
  listing_type: ListingType;
  sort: SortKey;
  include_expired?: boolean;
};

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
            No Listings Yet
          </p>
          <p className="text-sm text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
            Be the first to post a scrimmage listing.
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

/* -------------- Page -------------- */
export default function ScrimmageMarketplacePage() {
  const { hasAnyRole } = usePermissions();

  const [filters, setFilters] = useState<FilterState>({ q: "", listing_type: "all", sort: "date_asc" });
  const [geo, setGeo] = useState<ZipRadiusValue>({
    zip: "",
    lat: null,
    lng: null,
    place: null,
    radiusMiles: 25,
  });
  const [view, setView] = useState<ScrimmageView>("list");
  const pageSize = 20;
  const [page, setPage] = useState(1);
  const debouncedQ = useDebounced(filters.q, 300);

  const [listings, setListings] = useState<ListingRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sports, setSports] = useState<{ id: number; name: string }[]>([]);
  const [bats, setBats] = useState<{ id: number; name: string; sport_id: number | null }[]>([]);
  const [createOpen, setCreateOpen] = useState(false);

  // Load lookups
  useEffect(() => {
    fetch("/api/lookups")
      .then((r) => r.json())
      .then((d) => {
        setSports(d?.sports ?? []);
        setBats(d?.bats ?? []);
      })
      .catch(() => {});
  }, []);

  const activeSportId = filters.sport ? parseInt(filters.sport, 10) : null;

  const isBatDisabled = (bat: { sport_id: number | null }) =>
    activeSportId != null && bat.sport_id != null && bat.sport_id !== activeSportId;

  const toggleBatFilter = (id: number) => {
    const bat = bats.find((b) => b.id === id);
    if (bat && isBatDisabled(bat)) return;
    setFilters((f) => {
      const current = f.bats ?? [];
      const next = current.includes(id) ? current.filter((b) => b !== id) : [...current, id];
      return { ...f, bats: next.length === 0 ? undefined : next };
    });
  };

  const setSportFilter = (sportValue: string | undefined) => {
    setFilters((f) => {
      const nextSportId = sportValue ? parseInt(sportValue, 10) : null;
      // Drop any selected bats that aren't tied to the new sport.
      const prunedBats = (f.bats ?? []).filter((id) => {
        const bat = bats.find((b) => b.id === id);
        if (!bat || bat.sport_id == null) return true;
        return nextSportId == null || bat.sport_id === nextSportId;
      });
      return {
        ...f,
        sport: sportValue,
        bats: prunedBats.length === 0 ? undefined : prunedBats,
      };
    });
  };

  const controllerRef = useRef<AbortController | null>(null);

  const load = async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (debouncedQ) params.set("q", debouncedQ);
      if (filters.sport) params.set("sport", filters.sport);
      if (filters.date_from) params.set("date_from", filters.date_from);
      if (filters.date_to) params.set("date_to", filters.date_to);
      if (filters.age_min) params.set("age_min", filters.age_min);
      if (filters.age_max) params.set("age_max", filters.age_max);
      if (filters.scope) params.set("scope", filters.scope);
      if (filters.bats && filters.bats.length > 0) params.set("bats", filters.bats.join(","));
      if (filters.listing_type !== "all") params.set("listing_type", filters.listing_type);
      if (filters.include_expired) params.set("include_expired", "true");
      params.set("sort", filters.sort);
      if (geo.lat !== null && geo.lng !== null) {
        params.set("lat", String(geo.lat));
        params.set("lng", String(geo.lng));
        params.set("radius", String(geo.radiusMiles));
      }
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));

      const res = await fetch(`/api/scrimmage-marketplace?${params}`, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setListings(json.listings ?? []);
      setTotal(json.total ?? 0);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const msg = err instanceof Error ? err.message : "Failed to load";
      setError(msg);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ, filters.sport, filters.date_from, filters.date_to, filters.age_min, filters.age_max, filters.scope, (filters.bats ?? []).join(","), filters.listing_type, filters.sort, filters.include_expired, geo.lat, geo.lng, geo.radiusMiles, page]);

  // Reset page on filter change
  useEffect(() => { setPage(1); }, [debouncedQ, filters.sport, filters.date_from, filters.date_to, filters.age_min, filters.age_max, filters.scope, filters.listing_type, filters.sort, filters.include_expired, geo.lat, geo.lng, geo.radiusMiles]);

  // When ZIP first becomes available, auto-select distance sort. When it's
  // cleared while distance was active, fall back to date_asc.
  useEffect(() => {
    const hasGeo = geo.lat !== null && geo.lng !== null;
    if (hasGeo && filters.sort === "date_asc") {
      setFilters((f) => ({ ...f, sort: "distance_asc" }));
    } else if (!hasGeo && filters.sort === "distance_asc") {
      setFilters((f) => ({ ...f, sort: "date_asc" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.lat, geo.lng]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const hasFilters = !!(
    filters.q || filters.sport || filters.date_from || filters.date_to ||
    filters.age_min || filters.age_max || filters.scope ||
    (filters.bats && filters.bats.length > 0) ||
    filters.listing_type !== "all" ||
    filters.include_expired ||
    geo.zip || geo.lat !== null
  );

  const clearFilters = () => {
    setFilters({ q: "", listing_type: "all", sort: "date_asc" });
    setGeo({ zip: "", lat: null, lng: null, place: null, radiusMiles: 25 });
    setPage(1);
  };

  return (
    <>
      <Header />

      <main className="mx-auto max-w-7xl px-4 md:px-6 pb-16">
        {/* Title bar */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pt-10 pb-6 border-b border-border">
          <div>
            <h1
              className="text-foreground leading-none"
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 800,
                fontSize: "28px",
                letterSpacing: "-0.02em",
                textTransform: "uppercase",
              }}
            >
              Scrimmage Marketplace
            </h1>
            <p
              className="mt-1 text-muted-foreground"
              style={{ fontFamily: "var(--font-body)", fontSize: "13px" }}
            >
              {total} open listing{total !== 1 ? "s" : ""}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {hasAnyRole && (
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="bg-primary text-primary-foreground px-4 py-2 text-[11px] font-semibold tracking-[0.08em] uppercase hover:opacity-90 transition-opacity"
                style={{ fontFamily: "var(--font-body)" }}
              >
                Post Listing
              </button>
            )}
            <Link
              href="/scrimmages/my-listings"
              className="border border-border text-foreground px-4 py-2 text-[11px] font-semibold tracking-[0.08em] uppercase hover:border-primary hover:text-primary transition-colors duration-100"
              style={{ fontFamily: "var(--font-body)" }}
            >
              My Scrimmages
            </Link>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-end gap-3 py-4">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
              placeholder="Search teams or locations…"
              className="pl-9 h-9 text-sm"
            />
            {filters.q && (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setFilters((f) => ({ ...f, q: "" }))}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Listing type — hosting / traveling */}
          <div
            className="inline-flex h-9 border border-border bg-input"
            role="group"
            aria-label="Filter by listing type"
          >
            {([
              { value: "all", label: "All" },
              { value: "hosting", label: "Hosting" },
              { value: "traveling", label: "Traveling" },
            ] as { value: ListingType; label: string }[]).map((opt) => {
              const active = filters.listing_type === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFilters((f) => ({ ...f, listing_type: opt.value }))}
                  aria-pressed={active}
                  className={`px-3 text-[10px] uppercase tracking-wider transition-colors duration-100 ${
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Sport */}
          <Select
            value={filters.sport ?? "__all__"}
            onValueChange={(v) => setSportFilter(v === "__all__" ? undefined : v)}
          >
            <SelectTrigger className="w-[130px] h-9 text-xs">
              <SelectValue placeholder="Sport" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Sports</SelectItem>
              {sports.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Date from */}
          <div className="flex items-center gap-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
              From
            </label>
            <input
              type="date"
              value={filters.date_from ?? ""}
              onChange={(e) => setFilters((f) => ({ ...f, date_from: e.target.value || undefined }))}
              className="h-9 px-2 text-xs border border-border bg-input text-foreground focus:outline-none focus:border-primary"
            />
          </div>

          {/* Date to */}
          <div className="flex items-center gap-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
              To
            </label>
            <input
              type="date"
              value={filters.date_to ?? ""}
              onChange={(e) => setFilters((f) => ({ ...f, date_to: e.target.value || undefined }))}
              className="h-9 px-2 text-xs border border-border bg-input text-foreground focus:outline-none focus:border-primary"
            />
          </div>

          {/* Age range */}
          <div className="flex items-center gap-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
              Ages
            </label>
            <input
              type="number"
              min="4"
              max="18"
              value={filters.age_min ?? ""}
              onChange={(e) => setFilters((f) => ({ ...f, age_min: e.target.value || undefined }))}
              placeholder="Min"
              className="h-9 w-16 px-2 text-xs border border-border bg-input text-foreground focus:outline-none focus:border-primary"
            />
            <span className="text-muted-foreground text-xs">–</span>
            <input
              type="number"
              min="4"
              max="18"
              value={filters.age_max ?? ""}
              onChange={(e) => setFilters((f) => ({ ...f, age_max: e.target.value || undefined }))}
              placeholder="Max"
              className="h-9 w-16 px-2 text-xs border border-border bg-input text-foreground focus:outline-none focus:border-primary"
            />
          </div>

          {/* Scope */}
          <Select
            value={filters.scope ?? "__all__"}
            onValueChange={(v) => setFilters((f) => ({ ...f, scope: v === "__all__" ? undefined : v }))}
          >
            <SelectTrigger className="w-[140px] h-9 text-xs">
              <SelectValue placeholder="Scope" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Any scope</SelectItem>
              <SelectItem value="division">Division only</SelectItem>
              <SelectItem value="league">League only</SelectItem>
            </SelectContent>
          </Select>

          {/* Bats (multi-select) */}
          {bats.length > 0 && (
            <div className="flex items-center gap-1">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                Bats
              </label>
              <DropdownMenu>
                <DropdownMenuTrigger
                  className={`inline-flex items-center justify-between gap-2 min-w-[110px] h-9 px-2 text-[10px] uppercase tracking-wider border bg-input transition-colors duration-100 focus:outline-none data-[state=open]:border-primary ${
                    (filters.bats?.length ?? 0) > 0
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary hover:text-primary"
                  }`}
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  {(filters.bats?.length ?? 0) > 0 ? `Bats (${filters.bats!.length})` : "Bats"}
                  <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[10rem]">
                  {bats.map((b) => {
                    const disabled = isBatDisabled(b);
                    return (
                      <DropdownMenuCheckboxItem
                        key={b.id}
                        checked={filters.bats?.includes(b.id) ?? false}
                        disabled={disabled}
                        onCheckedChange={() => toggleBatFilter(b.id)}
                        onSelect={(e) => e.preventDefault()}
                        title={disabled ? "Not used in the selected sport" : undefined}
                        className="text-xs uppercase tracking-wider"
                        style={{ fontFamily: "var(--font-body)" }}
                      >
                        {b.name}
                      </DropdownMenuCheckboxItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          {/* Zip + radius */}
          <ZipRadiusFilter value={geo} onChange={setGeo} />

          {/* Include expired */}
          <label
            className="flex items-center gap-2 h-9 px-2 cursor-pointer select-none text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
            style={{ fontFamily: "var(--font-body)" }}
          >
            <input
              type="checkbox"
              checked={!!filters.include_expired}
              onChange={(e) => setFilters((f) => ({ ...f, include_expired: e.target.checked || undefined }))}
              className="h-3.5 w-3.5 accent-primary"
            />
            Include expired
          </label>

          {/* Clear filters */}
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-[10px] tracking-[0.1em] uppercase text-primary hover:opacity-80 transition-opacity"
              style={{ fontFamily: "var(--font-body)" }}
            >
              Clear
            </button>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive mb-4">
            {error}
          </div>
        )}

        {/* Sort + View toggle */}
        <div className="flex items-center justify-end gap-3 pb-3">
          <div className="flex items-center gap-2">
            <label
              className="text-[10px] uppercase tracking-wider text-muted-foreground"
              style={{ fontFamily: "var(--font-body)" }}
            >
              Sort
            </label>
            <Select
              value={filters.sort}
              onValueChange={(v) => setFilters((f) => ({ ...f, sort: v as SortKey }))}
            >
              <SelectTrigger className="w-[170px] h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date_asc">Soonest available</SelectItem>
                <SelectItem value="posted_desc">Recently posted</SelectItem>
                <SelectItem value="distance_asc" disabled={geo.lat === null}>
                  Nearest{geo.lat === null ? " (set ZIP)" : ""}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <ViewToggle value={view} onChange={setView} />
        </div>

        {/* Results */}
        {view === "list" ? (
          <div className="border border-border bg-card">
            {loading ? (
              <div className="space-y-0">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-[72px] border-b border-border last:border-0 bg-elevated animate-pulse" />
                ))}
              </div>
            ) : listings.length === 0 ? (
              <EmptyState hasFilters={hasFilters} onClear={clearFilters} />
            ) : (
              listings.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))
            )}
          </div>
        ) : (
          <ScrimmageMap
            listings={listings}
            center={
              geo.lat !== null && geo.lng !== null
                ? { lat: geo.lat, lng: geo.lng, radiusMiles: geo.radiusMiles }
                : null
            }
          />
        )}

        {/* Pagination — list view only */}
        {view === "list" && !loading && total > pageSize && (
          <div className="flex justify-center pt-6">
            <Pagination page={page} pageCount={pageCount} onPage={setPage} />
          </div>
        )}
      </main>

      <CreateListingModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => { load(); }}
      />
    </>
  );
}
