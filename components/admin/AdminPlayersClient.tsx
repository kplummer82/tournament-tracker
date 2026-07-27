"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ShieldAlert, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";

// Cross-team COPPA player deletion tool (admin-only). Search a child's name,
// see every team they're rostered on, select the matching rows, and anonymize
// them all in one request. A player is a per-team row with no shared identity,
// so matching is by the admin's eye — team / division / season / jersey are
// shown as disambiguation context. Deleted rows are shown but not selectable.

type PlayerRow = {
  rosterId: number;
  teamId: number;
  teamName: string;
  division: string | null;
  season: string | null;
  year: number | null;
  firstName: string;
  lastName: string | null;
  jerseyNumber: number | null;
  deletedAt: string | null;
};

type BulkResult = { rosterId: number; teamId: number; status: string };

const INPUT =
  "w-full border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";
const FIELD_LABEL =
  "block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1";
const BTN_BASE =
  "inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors duration-100 border";

const PAGE_SIZE = 25;
const CONFIRM_WORD = "DELETE";

function fullName(p: PlayerRow): string {
  return [p.firstName, p.lastName].filter(Boolean).join(" ") || `Player ${p.rosterId}`;
}

function teamContext(p: PlayerRow): string {
  const parts = [p.division, [p.season, p.year].filter(Boolean).join(" ")]
    .map((s) => (s ?? "").toString().trim())
    .filter(Boolean);
  return parts.join(" · ");
}

export default function AdminPlayersClient() {
  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<PlayerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped to force a refetch of the current search (e.g. after a bulk delete).
  const [reloadToken, setReloadToken] = useState(0);

  // Selection persists across pages/searches, keyed by rosterId (a global PK).
  const [selected, setSelected] = useState<Record<number, PlayerRow>>({});

  // Confirm modal
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [requestedBy, setRequestedBy] = useState("");
  const [reason, setReason] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [resultSummary, setResultSummary] = useState<string | null>(null);

  // Debounce search input -> q
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(searchInput.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    if (!q) {
      setRows([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      q,
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    if (includeDeleted) params.set("includeDeleted", "1");
    fetch(`/api/admin/players/search?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setRows(data.rows ?? []);
        setTotal(typeof data.total === "number" ? data.total : 0);
      })
      .catch(() => {
        if (cancelled) return;
        setRows([]);
        setTotal(0);
        setError("Search failed. Please try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [q, page, includeDeleted, reloadToken]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const selectedList = Object.values(selected);
  const selectedCount = selectedList.length;

  const selectableRows = rows.filter((r) => !r.deletedAt);
  const allSelectableSelected =
    selectableRows.length > 0 && selectableRows.every((r) => selected[r.rosterId]);

  const toggleRow = (row: PlayerRow) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[row.rosterId]) delete next[row.rosterId];
      else next[row.rosterId] = row;
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected((prev) => {
      const next = { ...prev };
      if (allSelectableSelected) {
        for (const r of selectableRows) delete next[r.rosterId];
      } else {
        for (const r of selectableRows) next[r.rosterId] = r;
      }
      return next;
    });
  };

  const clearSelection = () => setSelected({});

  const openConfirm = () => {
    setRequestedBy("");
    setReason("");
    setConfirmText("");
    setSubmitError(null);
    setResultSummary(null);
    setConfirmOpen(true);
  };

  const handleConfirm = async () => {
    if (confirmText.trim() !== CONFIRM_WORD || selectedCount === 0) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/admin/players/anonymize-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targets: selectedList.map((p) => ({
            rosterId: p.rosterId,
            teamId: p.teamId,
          })),
          requestedBy: requestedBy.trim() || null,
          reason: reason.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Deletion failed");

      const results: BulkResult[] = data.results ?? [];
      const ok = results.filter((r) => r.status === "ok").length;
      const already = results.filter((r) => r.status === "alreadyDeleted").length;
      const notFound = results.filter((r) => r.status === "notFound").length;
      const bits = [`${ok} anonymized`];
      if (already) bits.push(`${already} already deleted`);
      if (notFound) bits.push(`${notFound} not found`);
      setResultSummary(bits.join(", ") + ".");

      setConfirmOpen(false);
      clearSelection();
      // Refresh the current search so anonymized rows update in place.
      setReloadToken((n) => n + 1);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Deletion failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* COPPA context banner */}
      <div className="flex items-start gap-2 p-3 border border-border bg-muted/40 text-sm text-muted-foreground">
        <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
        <p>
          Search a player by name to find every team they&apos;re rostered on, then
          anonymize the selected rows together (COPPA player-data deletion). Jersey
          numbers and game history are preserved; personal info is replaced and cannot
          be undone.
        </p>
      </div>

      {/* Search */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          className={cn(INPUT, "flex-1 min-w-[220px]")}
          placeholder="Search players by name…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <label
          className="flex items-center gap-1.5 text-xs text-muted-foreground select-none"
          style={{ fontFamily: "var(--font-body)" }}
        >
          <input
            type="checkbox"
            checked={includeDeleted}
            onChange={(e) => setIncludeDeleted(e.target.checked)}
          />
          Show already-deleted
        </label>
        <span
          className="text-xs text-muted-foreground tabular-nums shrink-0"
          style={{ fontFamily: "var(--font-body)" }}
        >
          {q ? (loading ? "…" : `${total} result${total === 1 ? "" : "s"}`) : ""}
        </span>
      </div>

      {resultSummary && (
        <p className="text-xs text-primary" style={{ fontFamily: "var(--font-body)" }}>
          {resultSummary}
        </p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}

      {/* Selection bar */}
      {selectedCount > 0 && (
        <div className="flex items-center justify-between gap-3 p-3 border border-primary/40 bg-primary/5">
          <span className="text-sm" style={{ fontFamily: "var(--font-body)" }}>
            {selectedCount} player row{selectedCount === 1 ? "" : "s"} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={clearSelection}
              className={cn(
                BTN_BASE,
                "border-border text-muted-foreground hover:text-foreground"
              )}
              style={{ fontFamily: "var(--font-body)" }}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={openConfirm}
              className={cn(
                BTN_BASE,
                "border-destructive/40 text-destructive hover:bg-destructive/10"
              )}
              style={{ fontFamily: "var(--font-body)" }}
            >
              <Trash2 className="h-3 w-3" />
              Anonymize {selectedCount} selected
            </button>
          </div>
        </div>
      )}

      {/* Results */}
      {!q ? (
        <p className="text-sm text-muted-foreground py-4">
          Type a name above to search across all teams.
        </p>
      ) : loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 bg-elevated animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">
          No players match &quot;{q}&quot;.
        </p>
      ) : (
        <div className="border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left">
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label="Select all on this page"
                    checked={allSelectableSelected}
                    onChange={toggleSelectAll}
                    disabled={selectableRows.length === 0}
                  />
                </th>
                <th className="px-3 py-2 font-semibold">Player</th>
                <th className="px-3 py-2 font-semibold">Team</th>
                <th className="px-3 py-2 font-semibold">Context</th>
                <th className="px-3 py-2 font-semibold">Jersey</th>
                <th className="px-3 py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => {
                const isDeleted = !!r.deletedAt;
                const isSelected = !!selected[r.rosterId];
                return (
                  <tr
                    key={r.rosterId}
                    className={cn(
                      "bg-card",
                      isDeleted && "opacity-60",
                      isSelected && "bg-primary/5"
                    )}
                  >
                    <td className="px-3 py-2 align-middle">
                      <input
                        type="checkbox"
                        aria-label={`Select ${fullName(r)}`}
                        checked={isSelected}
                        onChange={() => toggleRow(r)}
                        disabled={isDeleted}
                      />
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <span className={cn("font-medium", isDeleted && "italic text-muted-foreground")}>
                        {fullName(r)}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-middle">{r.teamName}</td>
                    <td className="px-3 py-2 align-middle text-muted-foreground text-xs">
                      {teamContext(r) || "—"}
                    </td>
                    <td className="px-3 py-2 align-middle tabular-nums">
                      {r.jerseyNumber ?? "—"}
                    </td>
                    <td className="px-3 py-2 align-middle">
                      {isDeleted ? (
                        <span
                          className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide border border-border text-muted-foreground"
                          title="Personal information deleted (COPPA)"
                        >
                          Data deleted
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Active</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {q && totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            className={cn(
              BTN_BASE,
              "border-border text-muted-foreground hover:text-foreground disabled:opacity-40"
            )}
            style={{ fontFamily: "var(--font-body)" }}
          >
            Prev
          </button>
          <span
            className="text-xs text-muted-foreground tabular-nums"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
            className={cn(
              BTN_BASE,
              "border-border text-muted-foreground hover:text-foreground disabled:opacity-40"
            )}
            style={{ fontFamily: "var(--font-body)" }}
          >
            Next
          </button>
        </div>
      )}

      {/* Confirm modal */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card border border-border w-full max-w-lg p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
                <h2 className="text-base font-bold">Anonymize player data</h2>
              </div>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="p-1 text-muted-foreground hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-sm text-muted-foreground">
              This replaces personal information on the{" "}
              <strong className="text-foreground">{selectedCount}</strong> selected roster
              row{selectedCount === 1 ? "" : "s"} below with{" "}
              <code>Deleted Player {"{id}"}</code>. Jersey numbers and game history are
              kept. This cannot be undone.
            </p>

            {/* Affected rows */}
            <div className="border border-border divide-y divide-border max-h-40 overflow-y-auto text-sm">
              {selectedList.map((p) => (
                <div key={p.rosterId} className="flex items-center justify-between px-3 py-1.5">
                  <span className="font-medium truncate">{fullName(p)}</span>
                  <span className="text-xs text-muted-foreground truncate ml-3">
                    {p.teamName}
                    {teamContext(p) ? ` · ${teamContext(p)}` : ""}
                  </span>
                </div>
              ))}
            </div>

            <div>
              <label className={FIELD_LABEL}>Requested by (optional)</label>
              <input
                className={INPUT}
                placeholder="e.g. parent name / email"
                value={requestedBy}
                onChange={(e) => setRequestedBy(e.target.value)}
                maxLength={500}
              />
            </div>
            <div>
              <label className={FIELD_LABEL}>Reason / note (optional)</label>
              <textarea
                className={cn(INPUT, "min-h-[64px] resize-y")}
                placeholder="e.g. COPPA parental deletion request"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={1000}
              />
            </div>
            <div>
              <label className={FIELD_LABEL}>
                Type <span className="text-destructive">{CONFIRM_WORD}</span> to confirm
              </label>
              <input
                className={INPUT}
                placeholder={CONFIRM_WORD}
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoFocus
              />
            </div>

            {submitError && <p className="text-xs text-destructive">{submitError}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={submitting}
                className={cn(
                  BTN_BASE,
                  "border-border text-muted-foreground hover:text-foreground disabled:opacity-40"
                )}
                style={{ fontFamily: "var(--font-body)" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={submitting || confirmText.trim() !== CONFIRM_WORD}
                className={cn(
                  BTN_BASE,
                  "bg-destructive text-destructive-foreground border-destructive hover:opacity-90 disabled:opacity-40"
                )}
                style={{ fontFamily: "var(--font-body)" }}
              >
                <Trash2 className="h-3 w-3" />
                {submitting ? "Anonymizing…" : `Anonymize ${selectedCount}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
