// pages/seasons/[seasonid]/playoffs.tsx
import { useCallback, useEffect, useRef, useState } from "react";
import SeasonProvider, { useSeason } from "@/components/seasons/SeasonProvider";
import SeasonShell from "@/components/seasons/SeasonShell";
import BracketPreview from "@/components/bracket/BracketPreview";
import LibraryPicker from "@/components/bracket/LibraryPicker";
import SeedAssignment, { seedLabelsFromAssignments } from "@/components/bracket/SeedAssignment";
import type { BracketStructure } from "@/components/bracket/types";
import { GitBranch, Plus, Trash2, ChevronDown, ChevronRight, RefreshCw, AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

type SeasonBracket = {
  id: number;
  season_id?: number;
  name: string;
  sort_order: number;
  template_id: number | null;
  structure: BracketStructure | null;
  updated_at: string;
};

type TeamOpt = { id: number; name: string };
type StandingsRow = { teamid: number; rank_final: number };

const BTN_BASE =
  "inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors duration-100 border";

// ---------- Individual bracket card ----------
function BracketCard({
  bracket,
  seasonId,
  teams,
  standingsOrder,
  onDeleted,
}: {
  bracket: SeasonBracket;
  seasonId: number;
  teams: TeamOpt[];
  standingsOrder: number[];
  onDeleted: (id: number) => void;
}) {
  const [structure, setStructure] = useState<BracketStructure | null>(bracket.structure ?? null);
  const [templateId, setTemplateId] = useState<number | null>(bracket.template_id ?? null);
  const [templateName, setTemplateName] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const autoFillApplied = useRef(false);

  // Load assignments on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/seasons/${seasonId}/brackets/${bracket.id}/assignments`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const assign: Record<number, number> = {};
        for (const a of data.assignments ?? []) {
          assign[a.seedIndex] = a.teamId;
        }
        setAssignments(assign);
      } catch { /* no-op */ } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [seasonId, bracket.id]);

  // Auto-fill from standings once assignments + structure are available
  useEffect(() => {
    if (autoFillApplied.current) return;
    if (!structure || standingsOrder.length === 0) return;
    const hasExistingAssignments = Object.keys(assignments).length > 0;
    if (hasExistingAssignments) { autoFillApplied.current = true; return; }
    if (loading) return;
    // Determine which seeds belong to THIS bracket based on sort_order
    // Gold (sort_order=0) gets top N, Silver gets next N, etc.
    const numSeeds = structure.numTeams;
    const offset = bracket.sort_order * numSeeds;
    const next: Record<number, number> = {};
    for (let seed = 1; seed <= numSeeds; seed++) {
      const teamId = standingsOrder[offset + seed - 1];
      if (teamId != null) next[seed] = teamId;
    }
    setAssignments(next);
    autoFillApplied.current = true;
  }, [structure, standingsOrder, assignments, loading, bracket.sort_order]);

  const handleSelectTemplate = useCallback(
    (template: { id: number; name: string; structure: BracketStructure }) => {
      setTemplateId(template.id);
      setTemplateName(template.name);
      setStructure(template.structure);
      setAssignments({});
      autoFillApplied.current = false;
      setPickerOpen(false);
    },
    []
  );

  const handleSave = useCallback(async () => {
    if (!structure || !templateId) {
      setError("Select a bracket template first.");
      return;
    }
    setSaving(true); setError(null);
    try {
      // Save bracket structure
      const patchRes = await fetch(`/api/seasons/${seasonId}/brackets/${bracket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_id: templateId, structure }),
      });
      if (!patchRes.ok) {
        const j = await patchRes.json().catch(() => ({}));
        throw new Error(j.error || "Failed to save bracket");
      }
      // Save seed assignments
      const assignmentsArray = Object.entries(assignments)
        .filter(([, teamId]) => Number.isFinite(teamId))
        .map(([seedStr, teamId]) => ({ seedIndex: parseInt(seedStr, 10), teamId: teamId }));
      const asgRes = await fetch(`/api/seasons/${seasonId}/brackets/${bracket.id}/assignments`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignments: assignmentsArray }),
      });
      if (!asgRes.ok) {
        const j = await asgRes.json().catch(() => ({}));
        throw new Error(j.error || "Failed to save assignments");
      }
    } catch (e: unknown) {
      setError((e as Error).message || "Save failed");
    } finally {
      setSaving(false);
    }
  }, [seasonId, bracket.id, structure, templateId, assignments]);

  const handleDelete = useCallback(async () => {
    if (!confirm(`Delete "${bracket.name}"? This will remove the bracket and all seed assignments.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/seasons/${seasonId}/brackets/${bracket.id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Delete failed");
      }
      onDeleted(bracket.id);
    } catch (e: unknown) {
      setError((e as Error).message || "Delete failed");
      setDeleting(false);
    }
  }, [seasonId, bracket.id, bracket.name, onDeleted]);

  const seedLabels = seedLabelsFromAssignments(assignments, teams);

  return (
    <div className="border border-border bg-card">
      {/* Bracket header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface">
        <h3
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontSize: "15px",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          {bracket.name}
        </h3>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
          title="Delete bracket"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {error && (
          <div className="flex items-start gap-2 text-sm text-destructive border border-destructive/40 bg-destructive/10 p-3">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Template picker */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="label-section">
              Bracket template
              {templateName && (
                <span className="ml-2 text-foreground normal-case font-normal">{templateName}</span>
              )}
              {structure && (
                <span className="ml-1 text-muted-foreground normal-case font-normal">
                  · {structure.numTeams} seeds
                </span>
              )}
            </p>
            <button
              type="button"
              onClick={() => setPickerOpen((o) => !o)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
              {pickerOpen ? "Hide" : structure ? "Change" : "Select template"}
              {pickerOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
          </div>
          {pickerOpen && (
            <div className="mb-3">
              <LibraryPicker onSelect={handleSelectTemplate} selectedId={templateId} />
            </div>
          )}
        </div>

        {/* Bracket preview */}
        {structure ? (
          <div>
            <p className="label-section mb-2">Preview</p>
            <BracketPreview structure={structure} seedLabels={seedLabels} editable={false} />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-32 border border-dashed border-border/60 text-center">
            <GitBranch className="h-6 w-6 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">Select a template to preview the bracket</p>
          </div>
        )}

        {/* Seed assignments */}
        {structure && !loading && (
          <div>
            <p className="label-section mb-2">Seed assignments</p>
            <SeedAssignment
              structure={structure}
              assignments={assignments}
              onChange={setAssignments}
              teams={teams}
            />
          </div>
        )}

        {/* Save button */}
        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !structure || !templateId}
            className={cn(BTN_BASE, "bg-primary text-primary-foreground border-primary hover:opacity-90 disabled:opacity-40")}
            style={{ fontFamily: "var(--font-body)" }}
          >
            {saving ? "Saving…" : "Save bracket"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Create bracket form ----------
function CreateBracketForm({
  seasonId,
  nextSortOrder,
  onCreated,
  onCancel,
}: {
  seasonId: number;
  nextSortOrder: number;
  onCreated: (b: SeasonBracket) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const SUGGESTED = ["Gold Bracket", "Silver Bracket", "Bronze Bracket", "Championship", "Consolation"];

  const handleCreate = async () => {
    if (!name.trim()) { setError("Name is required"); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/seasons/${seasonId}/brackets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), sort_order: nextSortOrder }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed to create");
      onCreated(j);
    } catch (e: unknown) {
      setError((e as Error).message || "Failed to create bracket");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
          New bracket
        </span>
        <button type="button" onClick={onCancel}>
          <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
        </button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <input
        className="w-full border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Gold Bracket"
        onKeyDown={(e) => e.key === "Enter" && handleCreate()}
        autoFocus
      />
      <div className="flex flex-wrap gap-1.5">
        {SUGGESTED.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setName(s)}
            className={cn(
              "px-2 py-0.5 text-[10px] border transition-colors",
              name === s
                ? "border-primary text-primary"
                : "border-border text-muted-foreground hover:border-primary/60"
            )}
            style={{ fontFamily: "var(--font-body)" }}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={cn(BTN_BASE, "border-border text-muted-foreground hover:bg-muted")} style={{ fontFamily: "var(--font-body)" }}>
          Cancel
        </button>
        <button type="button" onClick={handleCreate} disabled={saving} className={cn(BTN_BASE, "bg-primary text-primary-foreground border-primary hover:opacity-90 disabled:opacity-40")} style={{ fontFamily: "var(--font-body)" }}>
          {saving ? "Creating…" : "Create"}
        </button>
      </div>
    </div>
  );
}

// ---------- Main playoffs body ----------
function PlayoffsBody() {
  const { seasonId } = useSeason();
  const [brackets, setBrackets] = useState<SeasonBracket[]>([]);
  const [teams, setTeams] = useState<TeamOpt[]>([]);
  const [standingsOrder, setStandingsOrder] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (!seasonId) return;
    let cancelled = false;
    (async () => {
      setLoading(true); setErr(null);
      try {
        const [bracketsRes, teamsRes, standingsRes] = await Promise.all([
          fetch(`/api/seasons/${seasonId}/brackets`),
          fetch(`/api/seasons/${seasonId}/teams`),
          fetch(`/api/seasons/${seasonId}/standings`),
        ]);
        const bracketsData = bracketsRes.ok ? await bracketsRes.json() : { brackets: [] };
        const teamsData = teamsRes.ok ? await teamsRes.json() : { teams: [] };
        const standingsData = standingsRes.ok ? await standingsRes.json() : { standings: [] };
        if (!cancelled) {
          setBrackets(Array.isArray(bracketsData?.brackets) ? bracketsData.brackets : []);
          // teams API returns { teams: [{ id, name }] }
          const rawTeams = Array.isArray(teamsData?.teams) ? teamsData.teams : [];
          setTeams(rawTeams.map((t: any) => ({ id: t.id, name: t.name })));
          const standings: StandingsRow[] = Array.isArray(standingsData?.standings) ? standingsData.standings : [];
          setStandingsOrder(standings.slice().sort((a, b) => a.rank_final - b.rank_final).map((r) => r.teamid));
        }
      } catch (e: unknown) {
        if (!cancelled) setErr((e as Error).message || "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [seasonId]);

  const handleBracketCreated = (b: SeasonBracket) => {
    setBrackets((prev) => [...prev, b].sort((a, x) => a.sort_order - x.sort_order));
    setShowCreate(false);
  };

  const handleBracketDeleted = (id: number) => {
    setBrackets((prev) => prev.filter((b) => b.id !== id));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: "20px",
              textTransform: "uppercase",
              letterSpacing: "-0.01em",
            }}
          >
            Playoffs
          </h2>
          {!loading && (
            <p className="text-xs text-muted-foreground mt-0.5" style={{ fontFamily: "var(--font-body)" }}>
              {brackets.length} bracket{brackets.length !== 1 ? "s" : ""}
              {standingsOrder.length > 0 &&
                ` · ${standingsOrder.length} team${standingsOrder.length !== 1 ? "s" : ""} seeded from standings`}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowCreate((s) => !s)}
          className={cn(BTN_BASE, "bg-primary text-primary-foreground border-primary hover:opacity-90")}
          style={{ fontFamily: "var(--font-body)" }}
        >
          <Plus className="h-3.5 w-3.5" />
          Add Bracket
        </button>
      </div>

      {showCreate && seasonId && (
        <div className="mb-5">
          <CreateBracketForm
            seasonId={seasonId}
            nextSortOrder={brackets.length}
            onCreated={handleBracketCreated}
            onCancel={() => setShowCreate(false)}
          />
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-48 bg-elevated animate-pulse" />
          ))}
        </div>
      ) : err ? (
        <div className="border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{err}</div>
      ) : brackets.length === 0 && !showCreate ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border/60">
          <GitBranch className="h-8 w-8 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-foreground mb-1" style={{ fontFamily: "var(--font-display)", textTransform: "uppercase" }}>
            No Brackets Yet
          </p>
          <p className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
            Create brackets like "Gold" and "Silver" to organize your playoffs.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {brackets.map((b) =>
            seasonId ? (
              <BracketCard
                key={b.id}
                bracket={b}
                seasonId={seasonId}
                teams={teams}
                standingsOrder={standingsOrder}
                onDeleted={handleBracketDeleted}
              />
            ) : null
          )}
        </div>
      )}
    </div>
  );
}

export default function PlayoffsPage() {
  return (
    <SeasonProvider>
      <SeasonShell tab="playoffs">
        <PlayoffsBody />
      </SeasonShell>
    </SeasonProvider>
  );
}
