import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { WalkupSongInput, WalkupSongLink } from "@/components/teams/WalkupSongInput";
import { usePermissions } from "@/lib/hooks/usePermissions";
import type { TeamDetail } from "@/pages/api/teams/[teamId]";
import type { RosterRow } from "@/pages/api/teams/[teamId]/roster";

const fieldCls = "px-2 py-1.5 text-sm bg-input-bg border border-border focus:outline-none focus:border-primary transition-colors duration-100";

export default function RosterDetailPage() {
  const router = useRouter();
  const teamId = router.query.teamId as string | undefined;
  const rosterId = router.query.rosterId as string | undefined;

  const permissions = usePermissions();
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [person, setPerson] = useState<RosterRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canEdit = teamId && team
    ? permissions.canEditTeam(Number(teamId), team.league_id ?? null)
    : false;

  // Editing state
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    jersey_number: "",
    first_name: "",
    last_name: "",
    role: "" as "player" | "staff" | "",
    hat_monogram: "",
    walkup_song: "",
    walkup_song_itunes_id: null as number | null,
  });
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete state
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Fetch data
  useEffect(() => {
    if (!teamId || !rosterId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [teamRes, rosterRes] = await Promise.all([
          fetch(`/api/teams/${teamId}`, { cache: "no-store" }),
          fetch(`/api/teams/${teamId}/roster/${rosterId}`, { cache: "no-store" }),
        ]);
        if (!teamRes.ok) throw new Error("Team not found");
        if (!rosterRes.ok) throw new Error("Person not found");
        const teamData = await teamRes.json();
        const rosterData = await rosterRes.json();
        if (!cancelled) {
          setTeam(teamData.team ?? null);
          setPerson(rosterData);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [teamId, rosterId]);

  const startEditing = () => {
    if (!person) return;
    setDraft({
      jersey_number: person.jersey_number != null ? String(person.jersey_number) : "",
      first_name: person.first_name,
      last_name: person.last_name ?? "",
      role: person.role,
      hat_monogram: person.hat_monogram ?? "",
      walkup_song: person.walkup_song ?? "",
      walkup_song_itunes_id: person.walkup_song_itunes_id ?? null,
    });
    setEditError(null);
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setEditError(null);
  };

  const handleSave = async () => {
    if (!teamId || !rosterId || !person) return;
    if (!draft.first_name.trim()) { setEditError("First name is required."); return; }
    if (!draft.role) { setEditError("Role is required."); return; }

    setSaving(true);
    setEditError(null);
    try {
      // Patch core fields
      const jn = draft.jersey_number.trim() ? parseInt(draft.jersey_number, 10) : null;
      const coreRes = await fetch(`/api/teams/${teamId}/roster/${rosterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: draft.first_name.trim(),
          last_name: draft.last_name.trim() || null,
          role: draft.role,
          jersey_number: Number.isFinite(jn) ? jn : null,
        }),
      });
      if (!coreRes.ok) {
        const data = await coreRes.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${coreRes.status}`);
      }

      // Patch parent-view fields
      const parentRes = await fetch(`/api/teams/${teamId}/roster/${rosterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hat_monogram: draft.hat_monogram.trim() || null,
          walkup_song: draft.walkup_song.trim() || null,
          walkup_song_itunes_id: draft.walkup_song_itunes_id,
        }),
      });
      if (!parentRes.ok) {
        const data = await parentRes.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${parentRes.status}`);
      }
      const updated: RosterRow = await parentRes.json();
      setPerson(updated);
      setEditing(false);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!teamId || !rosterId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/roster/${rosterId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      router.push(`/teams/${teamId}?tab=roster`);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Failed to delete");
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  if (router.isFallback || loading) {
    return (
      <div className="min-h-screen">
        <Header />
        <main className="p-4 sm:p-6 md:p-8 mx-auto max-w-7xl">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </main>
      </div>
    );
  }

  if (error || !person) {
    return (
      <div className="min-h-screen">
        <Header />
        <main className="p-4 sm:p-6 md:p-8 mx-auto max-w-7xl space-y-4">
          <Link
            href={`/teams/${teamId ?? ""}?tab=roster`}
            className="text-sm text-primary hover:underline"
          >
            ← Back to roster
          </Link>
          <p className="text-sm text-destructive">{error || "Person not found"}</p>
        </main>
      </div>
    );
  }

  const fullName = [person.first_name, person.last_name].filter(Boolean).join(" ");

  const labelCls = "text-[10px] uppercase tracking-[0.08em] text-muted-foreground font-medium";
  const valueCls = "text-sm text-foreground";

  return (
    <div className="min-h-screen">
      <Header />
      <main className="p-4 sm:p-6 md:p-8 mx-auto max-w-7xl space-y-6">
        <Link
          href={`/teams/${teamId}?tab=roster`}
          className="text-sm text-primary hover:underline"
        >
          ← Back to roster
        </Link>

        <div>
          <h1
            className="uppercase"
            style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "28px", letterSpacing: "-0.02em", lineHeight: 1 }}
          >
            {fullName}
          </h1>
          <p
            className="text-sm text-muted-foreground mt-1"
            style={{ fontFamily: "var(--font-body)" }}
          >
            {person.role === "player" ? "Player" : "Staff"}
            {person.jersey_number != null && ` · #${person.jersey_number}`}
            {team && ` · ${team.name}`}
          </p>
        </div>

        {/* ── Read-only details ─────────────────────────────────── */}
        {!editing && (
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2
                  className="uppercase"
                  style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "18px", letterSpacing: "-0.01em" }}
                >
                  Details
                </h2>
                {canEdit && (
                  <button
                    type="button"
                    onClick={startEditing}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.07em]",
                      "border border-border text-muted-foreground hover:text-foreground transition-colors duration-100"
                    )}
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    <Pencil className="h-3 w-3" />
                    Edit
                  </button>
                )}
              </div>

              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-8">
                {person.role === "player" && (
                  <div>
                    <dt className={labelCls} style={{ fontFamily: "var(--font-body)" }}>Jersey Number</dt>
                    <dd
                      className="tabular-nums mt-0.5"
                      style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "20px" }}
                    >
                      {person.jersey_number != null ? person.jersey_number : <span className="text-muted-foreground/40">—</span>}
                    </dd>
                  </div>
                )}
                <div>
                  <dt className={labelCls} style={{ fontFamily: "var(--font-body)" }}>Name</dt>
                  <dd className={cn(valueCls, "mt-0.5 font-medium")} style={{ fontFamily: "var(--font-body)" }}>{fullName}</dd>
                </div>
                <div>
                  <dt className={labelCls} style={{ fontFamily: "var(--font-body)" }}>Role</dt>
                  <dd className={cn(valueCls, "mt-0.5 capitalize")} style={{ fontFamily: "var(--font-body)" }}>{person.role}</dd>
                </div>
                {person.hat_monogram && (
                  <div>
                    <dt className={labelCls} style={{ fontFamily: "var(--font-body)" }}>Hat Monogram</dt>
                    <dd
                      className="mt-0.5 uppercase text-sm"
                      style={{ fontFamily: "var(--font-display)", letterSpacing: "0.06em" }}
                    >
                      {person.hat_monogram}
                    </dd>
                  </div>
                )}
                {person.walkup_song && (
                  <div className="sm:col-span-2">
                    <dt className={labelCls} style={{ fontFamily: "var(--font-body)" }}>Walk-up Song</dt>
                    <dd className="mt-0.5">
                      <WalkupSongLink song={person.walkup_song} itunesId={person.walkup_song_itunes_id} />
                    </dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>
        )}

        {/* ── Edit form ─────────────────────────────────────────── */}
        {editing && (
          <Card>
            <CardContent className="p-6">
              <h2
                className="uppercase mb-4"
                style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "18px", letterSpacing: "-0.01em" }}
              >
                Edit
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* First name */}
                <div className="space-y-1">
                  <Label
                    className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground"
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    First Name *
                  </Label>
                  <Input
                    value={draft.first_name}
                    onChange={(e) => setDraft((d) => ({ ...d, first_name: e.target.value }))}
                    className={fieldCls}
                    style={{ fontFamily: "var(--font-body)" }}
                  />
                </div>

                {/* Last name */}
                <div className="space-y-1">
                  <Label
                    className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground"
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    Last Name
                  </Label>
                  <Input
                    value={draft.last_name}
                    onChange={(e) => setDraft((d) => ({ ...d, last_name: e.target.value }))}
                    className={fieldCls}
                    style={{ fontFamily: "var(--font-body)" }}
                  />
                </div>

                {/* Jersey number */}
                <div className="space-y-1">
                  <Label
                    className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground"
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    Jersey #
                  </Label>
                  <Input
                    type="number"
                    value={draft.jersey_number}
                    onChange={(e) => setDraft((d) => ({ ...d, jersey_number: e.target.value }))}
                    className={cn(fieldCls, "w-24")}
                    style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}
                  />
                </div>

                {/* Role */}
                <div className="space-y-1">
                  <Label
                    className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground"
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    Role *
                  </Label>
                  <Select
                    value={draft.role}
                    onValueChange={(v) => setDraft((d) => ({ ...d, role: v as "player" | "staff" }))}
                  >
                    <SelectTrigger className={cn(fieldCls, "w-full")} style={{ fontFamily: "var(--font-body)" }}>
                      <SelectValue placeholder="Select role…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="player">Player</SelectItem>
                      <SelectItem value="staff">Staff</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Hat monogram */}
                <div className="space-y-1">
                  <Label
                    className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground"
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    Hat Monogram
                  </Label>
                  <Input
                    value={draft.hat_monogram}
                    maxLength={30}
                    onChange={(e) => setDraft((d) => ({ ...d, hat_monogram: e.target.value.toUpperCase() }))}
                    placeholder="e.g. SMITH"
                    className={cn(fieldCls, "uppercase placeholder:normal-case")}
                    style={{ fontFamily: "var(--font-display)", letterSpacing: "0.06em" }}
                  />
                </div>

                {/* Walk-up song */}
                <div className="space-y-1 sm:col-span-2">
                  <Label
                    className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground"
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    Walk-up Song
                  </Label>
                  <WalkupSongInput
                    value={draft.walkup_song}
                    itunesId={draft.walkup_song_itunes_id}
                    onChange={(song, itunesId) =>
                      setDraft((d) => ({ ...d, walkup_song: song, walkup_song_itunes_id: itunesId }))
                    }
                    onBlurCommit={() => {}}
                  />
                </div>
              </div>

              {editError && (
                <p className="text-xs text-destructive mt-3" style={{ fontFamily: "var(--font-body)" }}>{editError}</p>
              )}

              <div className="flex items-center gap-2 mt-4">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.07em]",
                    "bg-primary text-primary-foreground hover:opacity-90 transition-opacity duration-100",
                    saving && "opacity-60 cursor-not-allowed"
                  )}
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  {saving && <Loader2 className="h-3 w-3 animate-spin" />}
                  Save
                </button>
                <button
                  type="button"
                  onClick={cancelEditing}
                  disabled={saving}
                  className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] border border-border text-muted-foreground hover:text-foreground transition-colors duration-100"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  Cancel
                </button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Danger zone ───────────────────────────────────────── */}
        {canEdit && !editing && (
          <Card className="border-destructive/20">
            <CardContent className="p-6">
              <h2
                className="uppercase mb-2"
                style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "14px", letterSpacing: "-0.01em" }}
              >
                Danger Zone
              </h2>
              <p className="text-xs text-muted-foreground mb-3" style={{ fontFamily: "var(--font-body)" }}>
                Remove this person from the roster permanently.
              </p>
              {!confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] border border-destructive/40 text-destructive hover:bg-destructive/10 transition-colors duration-100"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  <Trash2 className="h-3 w-3" />
                  Delete
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.07em]",
                      "bg-destructive text-white hover:opacity-90 transition-opacity duration-100",
                      deleting && "opacity-60 cursor-not-allowed"
                    )}
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    {deleting && <Loader2 className="h-3 w-3 animate-spin" />}
                    Confirm Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    disabled={deleting}
                    className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] border border-border text-muted-foreground hover:text-foreground transition-colors duration-100"
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    Cancel
                  </button>
                </div>
              )}
              {editError && !editing && (
                <p className="text-xs text-destructive mt-2" style={{ fontFamily: "var(--font-body)" }}>{editError}</p>
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
