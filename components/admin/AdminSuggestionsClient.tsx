"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FieldRef = { id: number; name: string };

type Snapshot = {
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
  fields: FieldRef[];
};

type Suggestion = {
  id: number;
  suggestion_type: "edit" | "new" | "removal";
  location_id: number | null;
  location_name: string | null;
  payload: any;
  snapshot: Snapshot | null;
  reason: string | null;
  status: "pending" | "approved" | "rejected" | "superseded";
  submitted_by: string;
  submitted_by_name: string | null;
  submitted_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  ai_status: "pending" | "running" | "completed" | "error" | "skipped";
  ai_recommendation: "approve" | "reject" | "unsure" | null;
  ai_confidence: number | string | null;
  ai_rationale: string | null;
  ai_flags: { duplicate_location_ids?: number[]; flags?: string[] } | null;
  ai_model: string | null;
  ai_error: string | null;
};

type Detail = { suggestion: Suggestion; current: Snapshot | null; stale: boolean };

// Editable form for approving a new-location suggestion "with edits". All
// values are strings while editing; they're coerced back to the payload shape
// when sending. `fields` is the working list of field names.
type NewEditForm = {
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  latitude: string;
  longitude: string;
  fields: string[];
};

type Conflict =
  | { code: "stale" }
  | { code: "possible_duplicate"; matches: { id: number; name: string; city: string | null; state: string | null }[] }
  | { code: "target_deleted" }
  | { code: "field_name_conflict"; error: string };

const STATUS_FILTERS = ["pending", "approved", "rejected", "superseded", "all"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const TYPE_BADGES: Record<Suggestion["suggestion_type"], { label: string; className: string }> = {
  edit: { label: "Edit", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  new: { label: "New location", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" },
  removal: { label: "Removal", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
};

const STATUS_BADGES: Record<Suggestion["status"], string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  superseded: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

const REMOVAL_REASON_LABELS: Record<string, string> = {
  closed: "Permanently closed",
  duplicate: "Duplicate of another location",
  wrong: "Wrong / doesn't exist",
  other: "Other",
};

const ATTR_LABELS: Record<string, string> = {
  name: "Name",
  address: "Address",
  city: "City",
  state: "State",
  zip: "ZIP",
  latitude: "Latitude",
  longitude: "Longitude",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function fmtVal(v: unknown): string {
  if (v == null || v === "") return "—";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(6);
  return String(v);
}

function AiChip({ s }: { s: Suggestion }) {
  if (s.ai_status === "running" || s.ai_status === "pending") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin" /> AI…
      </span>
    );
  }
  if (s.ai_status === "error") {
    return <span className="text-xs text-red-600 dark:text-red-400">AI error</span>;
  }
  if (s.ai_status === "skipped") {
    return <span className="text-xs text-muted-foreground">AI off</span>;
  }
  const conf = s.ai_confidence != null ? Math.round(Number(s.ai_confidence) * 100) : null;
  const cls =
    s.ai_recommendation === "approve"
      ? "text-emerald-700 dark:text-emerald-400"
      : s.ai_recommendation === "reject"
        ? "text-red-600 dark:text-red-400"
        : "text-muted-foreground";
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", cls)}>
      <Bot className="w-3.5 h-3.5" />
      {s.ai_recommendation ?? "?"}
      {conf != null && <span className="font-normal">({conf}%)</span>}
    </span>
  );
}

export default function AdminSuggestionsClient() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, Detail>>({});
  const [note, setNote] = useState("");
  const [editForm, setEditForm] = useState<NewEditForm | null>(null);
  const [newFieldText, setNewFieldText] = useState("");
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [actioning, setActioning] = useState<"approve" | "reject" | "reanalyze" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchList = useCallback(async (status: StatusFilter) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/location-suggestions?status=${status}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setSuggestions(data.suggestions ?? []);
      setCounts(data.counts ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load suggestions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchList(statusFilter);
  }, [statusFilter, fetchList]);

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  const fetchDetail = useCallback(async (id: number): Promise<Detail | null> => {
    try {
      const res = await fetch(`/api/admin/location-suggestions/${id}`, { credentials: "include" });
      if (!res.ok) return null;
      const data = (await res.json()) as Detail;
      setDetails((prev) => ({ ...prev, [id]: data }));
      setSuggestions((prev) => prev.map((s) => (s.id === id ? { ...s, ...data.suggestion } : s)));
      return data;
    } catch {
      return null;
    }
  }, []);

  const toggleExpand = (id: number) => {
    setConflict(null);
    setActionError(null);
    setNote("");
    setEditForm(null);
    setNewFieldText("");
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    fetchDetail(id);
  };

  // Open the editable form for a new-location suggestion, pre-filled with the
  // submitter's proposed values.
  const startEditNew = (s: Suggestion) => {
    const p = s.payload ?? {};
    setEditForm({
      name: p.name ?? "",
      address: p.address ?? "",
      city: p.city ?? "",
      state: p.state ?? "",
      zip: p.zip ?? "",
      latitude: p.latitude != null ? String(p.latitude) : "",
      longitude: p.longitude != null ? String(p.longitude) : "",
      fields: Array.isArray(p.fields) ? p.fields.map((f: unknown) => String(f)) : [],
    });
    setNewFieldText("");
    setConflict(null);
    setActionError(null);
  };

  const setEditField = (key: keyof Omit<NewEditForm, "fields">, value: string) =>
    setEditForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  const addEditFieldName = () => {
    const name = newFieldText.trim();
    if (!name) return;
    setEditForm((prev) =>
      prev && !prev.fields.some((f) => f.toLowerCase() === name.toLowerCase())
        ? { ...prev, fields: [...prev.fields, name] }
        : prev
    );
    setNewFieldText("");
  };

  const removeEditFieldName = (name: string) =>
    setEditForm((prev) => (prev ? { ...prev, fields: prev.fields.filter((f) => f !== name) } : prev));

  // Coerce the string-based edit form into the new-payload shape the approve
  // endpoint expects (empty text → null, numeric coords, trimmed fields).
  const buildEdits = (f: NewEditForm) => ({
    name: f.name.trim(),
    address: f.address.trim() || null,
    city: f.city.trim() || null,
    state: f.state.trim() || null,
    zip: f.zip.trim() || null,
    latitude: f.latitude.trim() ? Number(f.latitude) : null,
    longitude: f.longitude.trim() ? Number(f.longitude) : null,
    fields: f.fields.map((x) => x.trim()).filter(Boolean),
  });

  const startAiPolling = (id: number) => {
    if (pollRef.current) clearInterval(pollRef.current);
    let tries = 0;
    pollRef.current = setInterval(async () => {
      tries += 1;
      const detail = await fetchDetail(id);
      const st = detail?.suggestion.ai_status;
      if ((st && st !== "running" && st !== "pending") || tries >= 15) {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }, 2500);
  };

  const act = async (
    id: number,
    action: "approve" | "reject",
    force = false,
    edits: ReturnType<typeof buildEdits> | null = null
  ) => {
    setActioning(action);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/location-suggestions/${id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          note: note || undefined,
          ...(force ? { force: true } : {}),
          ...(edits ? { edits } : {}),
        }),
      });
      if (res.status === 409) {
        const data = await res.json().catch(() => ({}));
        if (data.code === "not_pending") {
          setActionError("This suggestion was already reviewed elsewhere.");
          await fetchList(statusFilter);
          return;
        }
        setConflict(data as Conflict);
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setConflict(null);
      setExpandedId(null);
      setNote("");
      setEditForm(null);
      await fetchList(statusFilter);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setActioning(null);
    }
  };

  const reanalyze = async (id: number) => {
    setActioning("reanalyze");
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/location-suggestions/${id}/reanalyze`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      await fetchDetail(id);
      startAiPolling(id);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to re-run analysis");
    } finally {
      setActioning(null);
    }
  };

  const renderEditDiff = (s: Suggestion, current: Snapshot | null) => {
    const attrs = s.payload?.attributes ?? {};
    const changed = Object.keys(ATTR_LABELS).filter((k) => attrs[k] != null);
    const fieldOps = s.payload?.fields ?? {};
    return (
      <div className="space-y-3">
        {changed.length > 0 && (
          <div className="overflow-x-auto">
            <table className="text-sm w-full max-w-xl">
              <thead>
                <tr className="text-xs text-muted-foreground text-left">
                  <th className="py-1 pr-4 font-medium">Attribute</th>
                  <th className="py-1 pr-4 font-medium">Current</th>
                  <th className="py-1 font-medium">Proposed</th>
                </tr>
              </thead>
              <tbody>
                {changed.map((k) => (
                  <tr key={k} className="border-t border-border">
                    <td className="py-1.5 pr-4 text-muted-foreground">{ATTR_LABELS[k]}</td>
                    <td className="py-1.5 pr-4">{fmtVal(current?.[k as keyof Snapshot] ?? s.snapshot?.[k as keyof Snapshot])}</td>
                    <td className="py-1.5 font-medium">{fmtVal(attrs[k])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {(fieldOps.add?.length || fieldOps.rename?.length || fieldOps.remove?.length) ? (
          <div className="text-sm space-y-1">
            <div className="text-xs text-muted-foreground font-medium">Field changes</div>
            {(fieldOps.add ?? []).map((n: string) => (
              <div key={`a-${n}`} className="text-emerald-700 dark:text-emerald-400">+ Add “{n}”</div>
            ))}
            {(fieldOps.rename ?? []).map((op: { id: number; from: string; to: string }) => (
              <div key={`r-${op.id}`}>Rename “{op.from}” → <span className="font-medium">“{op.to}”</span></div>
            ))}
            {(fieldOps.remove ?? []).map((op: { id: number; name: string }) => (
              <div key={`d-${op.id}`} className="text-red-600 dark:text-red-400">− Remove “{op.name}”</div>
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  const renderNewProposal = (s: Suggestion) => {
    const p = s.payload ?? {};
    return (
      <div className="text-sm space-y-1 max-w-xl">
        {Object.keys(ATTR_LABELS).map((k) =>
          p[k] != null ? (
            <div key={k} className="flex gap-2">
              <span className="text-muted-foreground w-20 shrink-0">{ATTR_LABELS[k]}</span>
              <span className="font-medium">{fmtVal(p[k])}</span>
            </div>
          ) : null
        )}
        {p.fields?.length ? (
          <div className="flex gap-2">
            <span className="text-muted-foreground w-20 shrink-0">Fields</span>
            <span>{p.fields.join(", ")}</span>
          </div>
        ) : null}
      </div>
    );
  };

  // Editable form shown when the admin chooses to approve a new-location
  // suggestion with changes. Mirrors the read-only proposal fields plus an
  // editable field-name list.
  const renderNewEditor = (f: NewEditForm) => {
    const textInput = (
      key: keyof Omit<NewEditForm, "fields">,
      label: string,
      placeholder = ""
    ) => (
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-muted-foreground">{label}</span>
        <input
          value={f[key]}
          onChange={(e) => setEditField(key, e.target.value)}
          placeholder={placeholder}
          className="rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
        />
      </label>
    );
    return (
      <div className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3">
        <div className="text-xs font-medium text-muted-foreground">Editing before approval</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-2xl">
          <div className="sm:col-span-2">{textInput("name", "Name")}</div>
          <div className="sm:col-span-2">{textInput("address", "Address")}</div>
          {textInput("city", "City")}
          {textInput("state", "State")}
          {textInput("zip", "ZIP")}
          <div className="hidden sm:block" />
          {textInput("latitude", "Latitude")}
          {textInput("longitude", "Longitude")}
        </div>
        <div className="space-y-1.5">
          <span className="text-xs text-muted-foreground">Fields</span>
          <div className="flex flex-wrap gap-1.5">
            {f.fields.length === 0 && (
              <span className="text-xs text-muted-foreground italic">No fields</span>
            )}
            {f.fields.map((name) => (
              <span
                key={name}
                className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs"
              >
                {name}
                <button
                  type="button"
                  onClick={() => removeEditFieldName(name)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`Remove ${name}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-1.5 max-w-xs">
            <input
              value={newFieldText}
              onChange={(e) => setNewFieldText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addEditFieldName();
                }
              }}
              placeholder="Add a field…"
              className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
            />
            <Button size="sm" variant="outline" type="button" onClick={addEditFieldName}>
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const renderRemoval = (s: Suggestion) => (
    <div className="text-sm space-y-1">
      <div>
        <span className="text-muted-foreground">Reason: </span>
        <span className="font-medium">
          {REMOVAL_REASON_LABELS[s.payload?.removal_reason] ?? s.payload?.removal_reason}
        </span>
      </div>
      {s.payload?.duplicate_of_location_id && (
        <div className="text-muted-foreground">
          Claimed duplicate of location #{s.payload.duplicate_of_location_id}
        </div>
      )}
      {s.snapshot && (
        <div className="text-muted-foreground">
          Target at submission: {s.snapshot.name}
          {s.snapshot.city ? `, ${s.snapshot.city}` : ""}
          {s.snapshot.fields.length ? ` (${s.snapshot.fields.length} fields)` : ""}
        </div>
      )}
    </div>
  );

  const renderAiCard = (s: Suggestion) => {
    if (s.ai_status === "skipped") {
      return <div className="text-xs text-muted-foreground">AI analysis not configured.</div>;
    }
    if (s.ai_status === "pending" || s.ai_status === "running") {
      return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> AI analysis in progress…
        </div>
      );
    }
    if (s.ai_status === "error") {
      return (
        <div className="space-y-2">
          <div className="text-sm text-red-600 dark:text-red-400">
            AI analysis failed{s.ai_error ? `: ${s.ai_error}` : "."}
          </div>
          <Button size="sm" variant="outline" onClick={() => reanalyze(s.id)} disabled={actioning !== null}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Re-run analysis
          </Button>
        </div>
      );
    }
    const conf = s.ai_confidence != null ? Math.round(Number(s.ai_confidence) * 100) : null;
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <AiChip s={s} />
          {conf != null && (
            <div className="h-1.5 w-24 bg-muted rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full",
                  s.ai_recommendation === "approve" ? "bg-emerald-500" : s.ai_recommendation === "reject" ? "bg-red-500" : "bg-gray-400"
                )}
                style={{ width: `${conf}%` }}
              />
            </div>
          )}
          {s.ai_model && <span className="text-xs text-muted-foreground">{s.ai_model}</span>}
          <Button size="sm" variant="ghost" onClick={() => reanalyze(s.id)} disabled={actioning !== null} title="Re-run analysis">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
        {s.ai_rationale && <p className="text-sm text-muted-foreground">{s.ai_rationale}</p>}
        {s.ai_flags?.flags?.length ? (
          <div className="flex flex-wrap gap-1">
            {s.ai_flags.flags.map((f) => (
              <span key={f} className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 text-xs">
                {f}
              </span>
            ))}
          </div>
        ) : null}
        {s.ai_flags?.duplicate_location_ids?.length ? (
          <div className="text-xs text-muted-foreground">
            Possible duplicates: {s.ai_flags.duplicate_location_ids.map((id) => `#${id}`).join(", ")}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Status filter pills */}
      <div className="flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map((f) => {
          const count = f === "all"
            ? Object.values(counts).reduce((a, b) => a + b, 0)
            : counts[f] ?? 0;
          return (
            <button
              key={f}
              onClick={() => { setExpandedId(null); setStatusFilter(f); }}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                statusFilter === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
              <span className="ml-1.5 text-xs opacity-80">{count}</span>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-2 animate-pulse">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 bg-muted rounded-lg" />
          ))}
        </div>
      ) : suggestions.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg p-8 text-center text-sm text-muted-foreground">
          No {statusFilter === "all" ? "" : statusFilter} suggestions.
        </div>
      ) : (
        <div className="space-y-2">
          {suggestions.map((s) => {
            const detail = details[s.id];
            const expanded = expandedId === s.id;
            const isPending = s.status === "pending";
            const targetDeleted =
              (s.suggestion_type === "edit" || s.suggestion_type === "removal") && s.location_id == null;
            // Approve-with-edits state (only for expanded new-location suggestions).
            const editing = expanded && s.suggestion_type === "new" && editForm != null;
            const edits = editing ? buildEdits(editForm!) : null;
            const editInvalid = editing && !edits!.name;
            return (
              <div key={s.id} className="border border-border rounded-lg bg-card">
                <button
                  onClick={() => toggleExpand(s.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left"
                >
                  {expanded ? (
                    <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                  <span className={cn("px-2 py-0.5 rounded text-xs font-medium shrink-0", TYPE_BADGES[s.suggestion_type].className)}>
                    {TYPE_BADGES[s.suggestion_type].label}
                  </span>
                  <span className="flex items-center gap-1.5 min-w-0 flex-1">
                    <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate font-medium text-sm">{s.location_name ?? "(unnamed)"}</span>
                  </span>
                  <span className="hidden sm:block text-xs text-muted-foreground shrink-0">
                    {s.submitted_by_name ?? s.submitted_by}
                  </span>
                  <span className="hidden md:block text-xs text-muted-foreground shrink-0">
                    {fmtDate(s.submitted_at)}
                  </span>
                  <AiChip s={s} />
                  {statusFilter !== "pending" && (
                    <span className={cn("px-2 py-0.5 rounded text-xs font-medium shrink-0", STATUS_BADGES[s.status])}>
                      {s.status}
                    </span>
                  )}
                </button>

                {expanded && (
                  <div className="border-t border-border px-4 py-4 space-y-4">
                    {targetDeleted && (
                      <div className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 rounded-md p-3 text-sm text-red-800 dark:text-red-300">
                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                        The target location has been deleted. This suggestion can only be rejected.
                      </div>
                    )}
                    {detail?.stale && (
                      <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 rounded-md p-3 text-sm text-amber-800 dark:text-amber-300">
                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                        This location changed since the suggestion was submitted — review the current values carefully.
                      </div>
                    )}

                    {s.suggestion_type === "edit" && renderEditDiff(s, detail?.current ?? null)}
                    {s.suggestion_type === "new" &&
                      (editing ? renderNewEditor(editForm!) : renderNewProposal(s))}
                    {s.suggestion_type === "removal" && renderRemoval(s)}

                    {s.reason && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">Submitter&rsquo;s note: </span>
                        {s.reason}
                      </div>
                    )}

                    {/* AI advisor */}
                    <div className="border border-border rounded-md p-3 bg-muted/40">
                      {renderAiCard(s)}
                    </div>

                    {s.status !== "pending" && (
                      <div className="text-sm text-muted-foreground">
                        {s.status === "approved" ? "Approved" : s.status === "rejected" ? "Rejected" : "Superseded"}
                        {s.reviewed_at ? ` on ${fmtDate(s.reviewed_at)}` : ""}
                        {s.review_note ? ` — “${s.review_note}”` : ""}
                      </div>
                    )}

                    {isPending && (
                      <div className="space-y-3">
                        {conflict?.code === "possible_duplicate" && (
                          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 rounded-md p-3 text-sm text-amber-800 dark:text-amber-300 space-y-1">
                            <div className="font-medium">Possible duplicate of:</div>
                            {conflict.matches.map((m) => (
                              <div key={m.id}>
                                #{m.id} {m.name}
                                {m.city ? `, ${m.city}` : ""}
                                {m.state ? `, ${m.state}` : ""}
                              </div>
                            ))}
                          </div>
                        )}
                        {conflict?.code === "stale" && (
                          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 rounded-md p-3 text-sm text-amber-800 dark:text-amber-300">
                            The location changed since submission. Approving anyway applies the proposed
                            values over the current ones.
                          </div>
                        )}
                        {conflict?.code === "field_name_conflict" && (
                          <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3 text-sm text-destructive">
                            {conflict.error}
                          </div>
                        )}
                        {actionError && (
                          <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3 text-sm text-destructive">
                            {actionError}
                          </div>
                        )}
                        <textarea
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="Optional review note (visible to the submitter)"
                          rows={2}
                          className="w-full max-w-xl rounded-md border border-border bg-background px-3 py-2 text-sm"
                        />
                        {editInvalid && (
                          <div className="text-xs text-destructive">A name is required.</div>
                        )}
                        <div className="flex flex-wrap gap-2">
                          {conflict && conflict.code !== "field_name_conflict" && conflict.code !== "target_deleted" ? (
                            <Button
                              size="sm"
                              onClick={() => act(s.id, "approve", true, edits)}
                              disabled={actioning !== null || editInvalid}
                            >
                              {actioning === "approve" ? (
                                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                              ) : (
                                <Check className="w-4 h-4 mr-1" />
                              )}
                              Approve anyway
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => act(s.id, "approve", false, edits)}
                              disabled={actioning !== null || targetDeleted || editInvalid}
                            >
                              {actioning === "approve" ? (
                                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                              ) : (
                                <Check className="w-4 h-4 mr-1" />
                              )}
                              {editing ? "Approve with edits" : "Approve & apply"}
                            </Button>
                          )}
                          {s.suggestion_type === "new" &&
                            (editing ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setEditForm(null);
                                  setNewFieldText("");
                                }}
                                disabled={actioning !== null}
                              >
                                Cancel edits
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => startEditNew(s)}
                                disabled={actioning !== null}
                              >
                                <Pencil className="w-3.5 h-3.5 mr-1" />
                                Edit before approving
                              </Button>
                            ))}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => act(s.id, "reject")}
                            disabled={actioning !== null}
                          >
                            {actioning === "reject" ? (
                              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                            ) : (
                              <X className="w-4 h-4 mr-1" />
                            )}
                            Reject
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
