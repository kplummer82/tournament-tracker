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
import PlayerPositionsCard from "@/components/teams/PlayerPositionsCard";
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
  const isAdmin = permissions.isSystemAdmin;

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
    walkup_song_start_seconds: null as number | null,
  });
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete state
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // COPPA data-deletion (anonymize) state — admin only
  const [showCoppa, setShowCoppa] = useState(false);
  const [coppaConfirmText, setCoppaConfirmText] = useState("");
  const [coppaRequestedBy, setCoppaRequestedBy] = useState("");
  const [coppaReason, setCoppaReason] = useState("");
  const [coppaSubmitting, setCoppaSubmitting] = useState(false);
  const [coppaError, setCoppaError] = useState<string | null>(null);

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
      walkup_song_start_seconds: person.walkup_song_start_seconds ?? null,
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
          walkup_song_start_seconds: draft.walkup_song_start_seconds,
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

  const handleCoppaDelete = async () => {
    if (!teamId || !rosterId) return;
    setCoppaSubmitting(true);
    setCoppaError(null);
    try {
      const res = await fetch(`/api/teams/${teamId}/roster/${rosterId}/anonymize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestedBy: coppaRequestedBy.trim() || null,
          reason: coppaReason.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.player) {
        setPerson(data.player);
      } else {
        // Already anonymized — refetch the current row.
        const r = await fetch(`/api/teams/${teamId}/roster/${rosterId}`, { cache: "no-store" });
        if (r.ok) setPerson(await r.json());
      }
      setShowCoppa(false);
      setCoppaConfirmText("");
      setCoppaRequestedBy("");
      setCoppaReason("");
    } catch (e) {
      setCoppaError(e instanceof Error ? e.message : "Failed to delete player data");
    } finally {
      setCoppaSubmitting(false);
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
  const isAnonymized = !!person.deleted_at;

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

        {isAnonymized && (
          <div
            className="border border-border bg-elevated/50 px-4 py-3 text-xs text-muted-foreground"
            style={{ fontFamily: "var(--font-body)" }}
          >
            This player&apos;s personal information was deleted on{" "}
            {new Date(person.deleted_at as string).toLocaleDateString()} in response to a
            data-deletion request (COPPA). The jersey number is retained so past lineups stay
            readable; historical games this player appeared in are preserved. This action cannot be
            undone.
          </div>
        )}

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
                {canEdit && !isAnonymized && (
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
                      <WalkupSongLink
                        song={person.walkup_song}
                        itunesId={person.walkup_song_itunes_id}
                        startSeconds={person.walkup_song_start_seconds}
                      />
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
                    startSeconds={draft.walkup_song_start_seconds}
                    onChange={(next) =>
                      setDraft((d) => ({
                        ...d,
                        walkup_song: next.song,
                        walkup_song_itunes_id: next.itunesId,
                        walkup_song_start_seconds: next.startSeconds,
                      }))
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

        {/* ── Positions ─────────────────────────────────────────── */}
        {/* Staff only — position ratings are coaching evaluations, and the API
            403s anyone without team access. Wait on permissions so the card
            doesn't flash in for a viewer who turns out not to be staff. */}
        {person.role === "player" && teamId && rosterId && !permissions.loading && canEdit && (
          <PlayerPositionsCard rosterId={Number(rosterId)} teamId={Number(teamId)} />
        )}

        {/* ── Danger zone ───────────────────────────────────────── */}
        {canEdit && !editing && !isAnonymized && (
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

        {/* ── COPPA data deletion (admin only) ──────────────────── */}
        {isAdmin && !editing && !isAnonymized && (
          <Card className="border-destructive/30">
            <CardContent className="p-6">
              <h2
                className="uppercase mb-2"
                style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "14px", letterSpacing: "-0.01em" }}
              >
                Delete Player Data (COPPA)
              </h2>
              <p className="text-xs text-muted-foreground mb-3 max-w-prose" style={{ fontFamily: "var(--font-body)" }}>
                Permanently anonymize this player&apos;s personal information in response to a
                data-deletion request. Their name, hat monogram, and walk-up song are erased and
                replaced with a generic label; the jersey number is kept and their game history is
                preserved. This cannot be undone.
              </p>
              <button
                type="button"
                onClick={() => { setShowCoppa(true); setCoppaError(null); }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] border border-destructive/50 text-destructive hover:bg-destructive/10 transition-colors duration-100"
                style={{ fontFamily: "var(--font-body)" }}
              >
                <Trash2 className="h-3 w-3" />
                Delete player data
              </button>
            </CardContent>
          </Card>
        )}
      </main>

      {/* ── COPPA confirm modal ─────────────────────────────────── */}
      {showCoppa && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !coppaSubmitting && setShowCoppa(false)}
        >
          <Card
            className="w-full max-w-md border-destructive/30"
            onClick={(e) => e.stopPropagation()}
          >
            <CardContent className="p-6 space-y-4">
              <h2
                className="uppercase"
                style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "16px", letterSpacing: "-0.01em" }}
              >
                Delete Player Data
              </h2>
              <p className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                This permanently anonymizes <span className="text-foreground font-semibold">{fullName}</span>.
                Their name and personal fields are erased and replaced with{" "}
                <span className="text-foreground font-semibold">Deleted Player {person.id}</span>.
                The jersey number and game history are kept. This cannot be undone.
              </p>

              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                  Requested by (optional)
                </Label>
                <Input
                  value={coppaRequestedBy}
                  onChange={(e) => setCoppaRequestedBy(e.target.value)}
                  placeholder="e.g. parent name / email"
                  className={fieldCls}
                  style={{ fontFamily: "var(--font-body)" }}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                  Reason / note (optional)
                </Label>
                <Input
                  value={coppaReason}
                  onChange={(e) => setCoppaReason(e.target.value)}
                  placeholder="e.g. COPPA deletion request"
                  className={fieldCls}
                  style={{ fontFamily: "var(--font-body)" }}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                  Type the player&apos;s name to confirm
                </Label>
                <Input
                  value={coppaConfirmText}
                  onChange={(e) => setCoppaConfirmText(e.target.value)}
                  placeholder={fullName}
                  className={fieldCls}
                  style={{ fontFamily: "var(--font-body)" }}
                />
              </div>

              {coppaError && (
                <p className="text-xs text-destructive" style={{ fontFamily: "var(--font-body)" }}>{coppaError}</p>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCoppaDelete}
                  disabled={coppaSubmitting || coppaConfirmText.trim() !== fullName.trim()}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.07em]",
                    "bg-destructive text-white hover:opacity-90 transition-opacity duration-100",
                    (coppaSubmitting || coppaConfirmText.trim() !== fullName.trim()) && "opacity-50 cursor-not-allowed"
                  )}
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  {coppaSubmitting && <Loader2 className="h-3 w-3 animate-spin" />}
                  Delete data
                </button>
                <button
                  type="button"
                  onClick={() => setShowCoppa(false)}
                  disabled={coppaSubmitting}
                  className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] border border-border text-muted-foreground hover:text-foreground transition-colors duration-100"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  Cancel
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
