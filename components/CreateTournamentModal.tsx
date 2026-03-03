"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, AlertTriangle } from "lucide-react";

/* ---------- Types ---------- */

type LookupRow = { id: number; name: string };

type FormState = {
  name?: string;
  city?: string;
  state?: string;
  year?: number;
  // store ids from selects as strings (Select emits strings)
  divisionId?: string;    // shows "10u", stores its id as string
  sportId?: string;
  statusId?: string;
  visibilityId?: string;
  maxrundiff?: number | null;
  advances_per_group?: number | null;
  num_pool_groups?: number | null;
};

const STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME",
  "MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA",
  "RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"
];

/* ---------- Lookups hook ---------- */

function useLookups() {
  const [sports, setSports] = useState<LookupRow[]>([]);
  const [statuses, setStatuses] = useState<LookupRow[]>([]);
  const [divisions, setDivisions] = useState<LookupRow[]>([]);
  const [visibilities, setVisibilities] = useState<LookupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/lookups");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) {
          setSports(Array.isArray(json.sports) ? json.sports : []);
          setStatuses(Array.isArray(json.statuses) ? json.statuses : []);
          setVisibilities(Array.isArray(json.visibilities) ? json.visibilities : []);
          setDivisions(Array.isArray(json.divisions) ? json.divisions : []);
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message || "Failed to load lookups");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { sports, statuses, visibilities, divisions, loading, error };
}

/* ---------- Component ---------- */

export type CreateTournamentDuplicateError = {
  message: string;
  existingId: number;
};

export default function CreateTournamentModal({
  onCreate,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  initialValues,
  duplicateError,
  showTrigger = true,
}: {
  onCreate: (payload: Record<string, any>) => Promise<void> | void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  initialValues?: Partial<FormState>;
  duplicateError?: CreateTournamentDuplicateError | null;
  showTrigger?: boolean;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOnOpenChange != null;
  const open = isControlled ? (controlledOpen ?? false) : internalOpen;
  const setOpen = isControlled ? (controlledOnOpenChange!) : setInternalOpen;

  const [form, setForm] = useState<FormState>({ year: new Date().getFullYear() });
  const { sports, statuses, visibilities, divisions, loading, error } = useLookups();

  // When opening with initialValues (e.g. clone), pre-fill form
  useEffect(() => {
    if (open && initialValues && Object.keys(initialValues).length > 0) {
      setForm((prev) => ({ ...prev, ...initialValues }));
    }
    if (!open) setForm((prev) => ({ ...prev, year: new Date().getFullYear() }));
  }, [open, initialValues]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  function toIntOrNull(v?: string) {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  const handleSubmit = async () => {
    if (!form.name) return;
    if (!form.sportId || !form.statusId || !form.visibilityId || !form.divisionId) return;

    const payload = {
      name: form.name?.trim(),
      city: form.city?.trim() || null,
      state: form.state || null,
      year: form.year ?? null,
      division: toIntOrNull(form.divisionId),
      divisionid: toIntOrNull(form.divisionId),
      sportid: toIntOrNull(form.sportId),
      statusid: toIntOrNull(form.statusId),
      visibilityid: toIntOrNull(form.visibilityId),
      maxrundiff:
        form.maxrundiff === undefined || form.maxrundiff === null
          ? null
          : Number(form.maxrundiff),
      advances_per_group:
        form.advances_per_group === undefined || form.advances_per_group === null
          ? null
          : Number(form.advances_per_group),
      num_pool_groups:
        form.num_pool_groups === undefined || form.num_pool_groups === null
          ? null
          : Number(form.num_pool_groups),
    };

    try {
      await onCreate(payload);
      if (!isControlled) {
        setOpen(false);
        setForm({ year: new Date().getFullYear() });
      }
    } catch (_) {
      // Parent handles 409 and sets duplicateError; modal stays open
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {showTrigger ? (
        <DialogTrigger asChild>
          <button
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-3 py-1.5 text-[11px] font-semibold tracking-[0.08em] uppercase hover:opacity-90 transition-opacity duration-100"
            style={{ fontFamily: "var(--font-body)" }}
          >
            <Plus className="h-3.5 w-3.5" />
            New Tournament
          </button>
        </DialogTrigger>
      ) : null}

      <DialogContent className="sm:max-w-lg rounded-none">
        <DialogHeader>
          <DialogTitle
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: "20px",
              textTransform: "uppercase",
              letterSpacing: "-0.01em",
            }}
          >
            {initialValues ? "Clone Tournament" : "Create Tournament"}
          </DialogTitle>
          <DialogDescription style={{ fontFamily: "var(--font-body)", fontSize: "13px" }}>
            {initialValues
              ? "Pre-filled from the cloned tournament. Change name or year to avoid duplicates, then save."
              : "Provide the core details. You can add teams and configure pool play and bracket later."}
          </DialogDescription>
        </DialogHeader>

        {duplicateError ? (
          <div className="flex items-start gap-3 border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">{duplicateError.message}</p>
              <p className="mt-1">
                <Link
                  href={`/tournaments/${duplicateError.existingId}`}
                  className="text-primary underline hover:no-underline"
                >
                  Open existing tournament →
                </Link>
              </p>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="text-sm text-destructive">Failed to load options: {error}</div>
        ) : null}

        <div className="grid gap-4 py-2">
          {/* Name */}
          <div className="grid gap-2">
            <Label htmlFor="name" className="label-section">Tournament name</Label>
            <Input
              id="name"
              placeholder="e.g., Coastal Summer Classic"
              value={form.name ?? ""}
              onChange={(e) => update("name", e.target.value)}
            />
          </div>

          {/* City / State */}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="city" className="label-section">City</Label>
              <Input
                id="city"
                placeholder="City"
                value={form.city ?? ""}
                onChange={(e) => update("city", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="state" className="label-section">State</Label>
              <Select value={form.state} onValueChange={(v) => update("state", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select state" />
                </SelectTrigger>
                <SelectContent>
                  {STATES.map((st) => (
                    <SelectItem key={st} value={st}>
                      {st}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Year / Division / Sport */}
          <div className="grid grid-cols-3 gap-4">
            <div className="grid gap-2">
              <Label className="label-section">Year</Label>
              <Input
                type="number"
                value={form.year ?? new Date().getFullYear()}
                onChange={(e) => update("year", Number(e.target.value))}
              />
            </div>

            <div className="grid gap-2">
              <Label className="label-section">Division</Label>
              <Select
                value={form.divisionId ?? ""}
                onValueChange={(v) => update("divisionId", v)}
                disabled={loading}
              >
                <SelectTrigger>
                  <SelectValue placeholder={loading ? "Loading..." : "Select"} />
                </SelectTrigger>
                <SelectContent>
                  {divisions.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.name} {/* shows "10u" */}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label className="label-section">Sport</Label>
              <Select
                value={form.sportId ?? ""}
                onValueChange={(v) => update("sportId", v)}
                disabled={loading}
              >
                <SelectTrigger>
                  <SelectValue placeholder={loading ? "Loading…" : "Select"} />
                </SelectTrigger>
                <SelectContent>
                  {sports.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Status / Visibility */}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label className="label-section">Status</Label>
              <Select
                value={form.statusId ?? ""}
                onValueChange={(v) => update("statusId", v)}
                disabled={loading}
              >
                <SelectTrigger>
                  <SelectValue placeholder={loading ? "Loading…" : "Select"} />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label className="label-section">Visibility</Label>
              <Select
                value={form.visibilityId ?? ""}
                onValueChange={(v) => update("visibilityId", v)}
                disabled={loading}
              >
                <SelectTrigger>
                  <SelectValue placeholder={loading ? "Loading…" : "Select"} />
                </SelectTrigger>
                <SelectContent>
                  {visibilities.map((v) => (
                    <SelectItem key={v.id} value={String(v.id)}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Optional: Max Run Diff / Pool Groups / Teams Advance Per Group */}
          <div className="grid grid-cols-3 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="maxrundiff" className="label-section">Max run diff</Label>
              <Input
                id="maxrundiff"
                type="number"
                placeholder="e.g., 7"
                value={form.maxrundiff ?? ""}
                onChange={(e) =>
                  update("maxrundiff", e.target.value === "" ? null : Number(e.target.value))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="num_pool_groups" className="label-section">Pool groups</Label>
              <Input
                id="num_pool_groups"
                type="number"
                min={1}
                max={8}
                placeholder="e.g., 2"
                value={form.num_pool_groups ?? ""}
                onChange={(e) =>
                  update("num_pool_groups", e.target.value === "" ? null : Number(e.target.value))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="advances_per_group" className="label-section">Advance per group</Label>
              <Input
                id="advances_per_group"
                type="number"
                min={1}
                placeholder="e.g., 1"
                value={form.advances_per_group ?? ""}
                onChange={(e) =>
                  update("advances_per_group", e.target.value === "" ? null : Number(e.target.value))
                }
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="px-4 py-2 text-[11px] uppercase tracking-[0.08em] border border-border text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors duration-100"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="px-4 py-2 text-[11px] uppercase tracking-[0.08em] bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-opacity duration-100"
            style={{ fontFamily: "var(--font-body)" }}
          >
            {initialValues ? "Clone Tournament" : "Create Tournament"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
