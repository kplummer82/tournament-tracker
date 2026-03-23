// components/ManageAccessPanel.tsx
// Reusable panel for scoped role management — used on league, division, tournament, and team pages.
import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, X, Shield, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type RoleRow = {
  id: number;
  user_id: string;
  role: string;
  scope_type: string;
  scope_id: number;
  created_at: string;
  created_by: string | null;
  entity_name: string | null;
  user_name: string | null;
  user_email: string | null;
  user_system_role: string | null;
};

type UserOption = { id: string; email: string; name: string | null };

const ROLE_LABELS: Record<string, string> = {
  league_admin: "League Admin",
  division_admin: "Division Admin",
  tournament_admin: "Tournament Admin",
  team_manager: "Team Manager",
  team_parent: "Team Parent",
};

// Which roles can be assigned within each scope type
const ASSIGNABLE_ROLES: Record<string, { value: string; label: string }[]> = {
  league: [
    { value: "league_admin", label: "League Admin" },
    { value: "division_admin", label: "Division Admin" },
  ],
  division: [
    { value: "division_admin", label: "Division Admin" },
    { value: "team_manager", label: "Team Manager" },
  ],
  tournament: [
    { value: "tournament_admin", label: "Tournament Admin" },
  ],
  team: [
    { value: "team_manager", label: "Team Manager" },
    { value: "team_parent", label: "Team Parent" },
  ],
};

// For role→scope_type mapping when assigning (e.g. assigning a division_admin from a league page
// requires scope_type=division + a division picker)
const ROLE_SCOPE_TYPE: Record<string, string> = {
  league_admin: "league",
  division_admin: "division",
  tournament_admin: "tournament",
  team_manager: "team",
  team_parent: "team",
};

const BTN_BASE =
  "inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors duration-100 border";
const INPUT =
  "w-full border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";

export default function ManageAccessPanel({
  scopeType,
  scopeId,
  /** For league scope: divisions under this league (for assigning division_admin) */
  divisions,
}: {
  scopeType: "league" | "division" | "tournament" | "team";
  scopeId: number;
  divisions?: { id: number; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Assign form state
  const [showAssign, setShowAssign] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [userLoading, setUserLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserOption | null>(null);
  const [assignRole, setAssignRole] = useState("");
  const [assignScopeId, setAssignScopeId] = useState<number>(scopeId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assignableRoles = ASSIGNABLE_ROLES[scopeType] ?? [];

  const fetchRoles = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch roles scoped to this entity and — for leagues — also child divisions
      const params = new URLSearchParams({ scope_type: scopeType, scope_id: String(scopeId) });
      const res = await fetch(`/api/admin/roles?${params}`, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      let allRoles: RoleRow[] = data.roles ?? [];

      // For leagues, also fetch division-level roles under this league
      if (scopeType === "league" && divisions?.length) {
        const childResults = await Promise.all(
          divisions.map(async (d) => {
            const r = await fetch(`/api/admin/roles?scope_type=division&scope_id=${d.id}`, { credentials: "include" });
            if (!r.ok) return [];
            const dd = await r.json();
            return dd.roles ?? [];
          })
        );
        allRoles = [...allRoles, ...childResults.flat()];
      }
      setRoles(allRoles);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [scopeType, scopeId, divisions]);

  useEffect(() => {
    if (open) fetchRoles();
  }, [open, fetchRoles]);

  // User search
  useEffect(() => {
    if (!userSearch.trim()) {
      setUserOptions([]);
      return;
    }
    const timer = setTimeout(async () => {
      setUserLoading(true);
      try {
        const res = await fetch("/api/admin/users", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          const list: UserOption[] = data?.data?.users ?? data?.users ?? [];
          const filtered = list.filter(
            (u) =>
              u.email?.toLowerCase().includes(userSearch.toLowerCase()) ||
              u.name?.toLowerCase().includes(userSearch.toLowerCase())
          );
          setUserOptions(filtered.slice(0, 8));
        }
      } catch {
        // ignore
      } finally {
        setUserLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [userSearch]);

  // When the selected role changes, determine the correct scope
  useEffect(() => {
    if (!assignRole) return;
    const roleScopeType = ROLE_SCOPE_TYPE[assignRole];
    // If the role's scope type matches the panel's scope type, use the panel's scopeId
    if (roleScopeType === scopeType) {
      setAssignScopeId(scopeId);
    }
    // If assigning division_admin from a league page, user needs to pick a division
  }, [assignRole, scopeType, scopeId]);

  const needsDivisionPicker =
    scopeType === "league" && assignRole === "division_admin" && divisions?.length;

  const handleAssign = async () => {
    if (!selectedUser || !assignRole) return;
    const roleScopeType = ROLE_SCOPE_TYPE[assignRole];
    const finalScopeId = needsDivisionPicker ? assignScopeId : scopeId;
    // If the role scope doesn't match the entity scope, validate
    if (needsDivisionPicker && !assignScopeId) {
      setError("Select a division");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          userId: selectedUser.id,
          role: assignRole,
          scopeType: roleScopeType,
          scopeId: finalScopeId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to assign role");
      // Reset form
      setShowAssign(false);
      setSelectedUser(null);
      setUserSearch("");
      setAssignRole("");
      fetchRoles();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (roleId: number) => {
    if (!confirm("Remove this role assignment?")) return;
    try {
      const res = await fetch(`/api/admin/roles/${roleId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to revoke");
      }
      setRoles((prev) => prev.filter((r) => r.id !== roleId));
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="border-t border-border pt-4 mt-6">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
        style={{ fontFamily: "var(--font-body)" }}
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <Shield className="h-3.5 w-3.5" />
        Manage Access
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          {/* Current role holders */}
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : roles.length === 0 ? (
            <div className="text-sm text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
              No role assignments yet.
            </div>
          ) : (
            <div className="border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface">
                    <th className="text-left p-3 pl-4 label-section">User</th>
                    <th className="text-left p-3 label-section">Role</th>
                    {scopeType === "league" && (
                      <th className="text-left p-3 label-section">Scope</th>
                    )}
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map((r) => (
                    <tr key={r.id} className="border-b border-border/50 last:border-0">
                      <td className="p-3 pl-4 text-foreground" style={{ fontFamily: "var(--font-body)" }}>
                        {r.user_name || r.user_email || `${r.user_id.slice(0, 8)}…`}
                      </td>
                      <td className="p-3">
                        <span className="text-xs px-2 py-0.5 border border-border" style={{ fontFamily: "var(--font-body)" }}>
                          {ROLE_LABELS[r.role] ?? r.role}
                        </span>
                      </td>
                      {scopeType === "league" && (
                        <td className="p-3 text-xs text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                          {r.entity_name ?? `${r.scope_type}:${r.scope_id}`}
                        </td>
                      )}
                      <td className="p-3 pr-4 text-right">
                        {r.user_system_role === "admin" ? (
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wider" style={{ fontFamily: "var(--font-body)" }}>
                            System Admin
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleRevoke(r.id)}
                            className="h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
                            title="Remove access"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Assign form toggle */}
          {!showAssign ? (
            <button
              type="button"
              onClick={() => setShowAssign(true)}
              className={cn(BTN_BASE, "bg-primary text-primary-foreground border-primary hover:opacity-90")}
              style={{ fontFamily: "var(--font-body)" }}
            >
              <Plus className="h-3 w-3" />
              Add Person
            </button>
          ) : (
            <div className="border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span
                  className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  Assign Role
                </span>
                <button type="button" onClick={() => { setShowAssign(false); setError(null); }}>
                  <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                </button>
              </div>

              {error && (
                <p className="text-xs text-destructive" style={{ fontFamily: "var(--font-body)" }}>
                  {error}
                </p>
              )}

              {/* User search */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                  User *
                </label>
                {selectedUser ? (
                  <div className="flex items-center gap-2 border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
                    <span className="flex-1">{selectedUser.email}</span>
                    <button type="button" onClick={() => { setSelectedUser(null); setUserSearch(""); }}>
                      <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      className={INPUT}
                      placeholder="Search by email or name…"
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      autoFocus
                    />
                    {userLoading && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">…</span>
                    )}
                    {userOptions.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 border border-border bg-card shadow-md max-h-48 overflow-auto">
                        {userOptions.map((u) => (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => {
                              setSelectedUser(u);
                              setUserSearch("");
                              setUserOptions([]);
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-elevated text-sm transition-colors"
                          >
                            <span className="text-foreground">{u.email}</span>
                            {u.name && (
                              <span className="ml-2 text-muted-foreground text-xs">{u.name}</span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Role selection */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                  Role *
                </label>
                <select className={INPUT} value={assignRole} onChange={(e) => setAssignRole(e.target.value)}>
                  <option value="">Select role…</option>
                  {assignableRoles.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Division picker (only for league → division_admin assignment) */}
              {needsDivisionPicker && (
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                    Division *
                  </label>
                  <select
                    className={INPUT}
                    value={assignScopeId}
                    onChange={(e) => setAssignScopeId(Number(e.target.value))}
                  >
                    <option value="">Select division…</option>
                    {divisions!.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Submit */}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setShowAssign(false); setError(null); }}
                  className={cn(BTN_BASE, "border-border text-muted-foreground hover:text-foreground")}
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAssign}
                  disabled={saving || !selectedUser || !assignRole}
                  className={cn(BTN_BASE, "bg-primary text-primary-foreground border-primary hover:opacity-90 disabled:opacity-40")}
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  {saving ? "Assigning…" : "Assign"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
