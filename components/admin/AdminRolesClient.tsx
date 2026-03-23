"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";

type RoleAssignment = {
  id: number;
  user_id: string;
  role: string;
  scope_type: string;
  scope_id: number;
  entity_name: string | null;
  created_at: string;
  created_by: string | null;
};

type UserOption = {
  id: string;
  email: string;
  name: string;
};

type EntityOption = {
  id: number;
  name: string;
};

const ROLE_OPTIONS = [
  { value: "league_admin", label: "League Admin", scopeType: "league" },
  { value: "division_admin", label: "Division Admin", scopeType: "division" },
  { value: "tournament_admin", label: "Tournament Admin", scopeType: "tournament" },
  { value: "team_manager", label: "Team Manager", scopeType: "team" },
  { value: "team_parent", label: "Team Parent", scopeType: "team" },
] as const;

const ROLE_LABELS: Record<string, string> = {
  league_admin: "League Admin",
  division_admin: "Division Admin",
  tournament_admin: "Tournament Admin",
  team_manager: "Team Manager",
  team_parent: "Team Parent",
};

const SCOPE_LABELS: Record<string, string> = {
  league: "League",
  division: "Division",
  tournament: "Tournament",
  team: "Team",
};

export default function AdminRolesClient() {
  const [roles, setRoles] = useState<RoleAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Assign form state
  const [showForm, setShowForm] = useState(false);
  const [formRole, setFormRole] = useState("");
  const [formUserId, setFormUserId] = useState("");
  const [formScopeId, setFormScopeId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // User search
  const [userSearch, setUserSearch] = useState("");
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [userLoading, setUserLoading] = useState(false);

  // Entity options
  const [entityOptions, setEntityOptions] = useState<EntityOption[]>([]);
  const [entityLoading, setEntityLoading] = useState(false);

  // Filter
  const [filterRole, setFilterRole] = useState("");

  // Deleting
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchRoles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/roles", { credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setRoles(data.roles ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load roles");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  // Search users when typing
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
          const list = data?.data?.users ?? data?.users ?? [];
          const filtered = (list as UserOption[]).filter(
            (u) =>
              u.email?.toLowerCase().includes(userSearch.toLowerCase()) ||
              u.name?.toLowerCase().includes(userSearch.toLowerCase())
          );
          setUserOptions(filtered.slice(0, 10));
        }
      } catch {
        // ignore
      } finally {
        setUserLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [userSearch]);

  // Load entity options when role changes
  useEffect(() => {
    if (!formRole) {
      setEntityOptions([]);
      return;
    }
    const roleConfig = ROLE_OPTIONS.find((r) => r.value === formRole);
    if (!roleConfig) return;

    setEntityLoading(true);
    setFormScopeId("");

    (async () => {
      try {
        let entities: EntityOption[] = [];
        switch (roleConfig.scopeType) {
          case "league": {
            const res = await fetch("/api/leagues", { credentials: "include" });
            if (res.ok) {
              const data = await res.json();
              entities = (data.rows ?? []).map((r: any) => ({ id: r.id, name: r.name }));
            }
            break;
          }
          case "division": {
            // Fetch all leagues, then all divisions
            const res = await fetch("/api/leagues", { credentials: "include" });
            if (res.ok) {
              const data = await res.json();
              const leagues = data.rows ?? [];
              for (const league of leagues) {
                const divRes = await fetch(`/api/leagues/${league.id}/divisions`, {
                  credentials: "include",
                });
                if (divRes.ok) {
                  const divData = await divRes.json();
                  const divs = divData.rows ?? [];
                  entities.push(
                    ...divs.map((d: any) => ({
                      id: d.id,
                      name: `${league.name} — ${d.name}`,
                    }))
                  );
                }
              }
            }
            break;
          }
          case "tournament": {
            const res = await fetch("/api/tournaments?pageSize=100", { credentials: "include" });
            if (res.ok) {
              const data = await res.json();
              entities = (data.rows ?? []).map((r: any) => ({ id: r.id, name: r.name }));
            }
            break;
          }
          case "team": {
            const res = await fetch("/api/teams?pageSize=100", { credentials: "include" });
            if (res.ok) {
              const data = await res.json();
              entities = (data.rows ?? []).map((r: any) => ({ id: r.id, name: r.name }));
            }
            break;
          }
        }
        setEntityOptions(entities);
      } catch {
        // ignore
      } finally {
        setEntityLoading(false);
      }
    })();
  }, [formRole]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const roleConfig = ROLE_OPTIONS.find((r) => r.value === formRole);
    if (!roleConfig || !formUserId || !formScopeId) {
      setFormError("All fields are required");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          userId: formUserId,
          role: formRole,
          scopeType: roleConfig.scopeType,
          scopeId: Number(formScopeId),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      // Reset form and refresh
      setShowForm(false);
      setFormRole("");
      setFormUserId("");
      setFormScopeId("");
      setUserSearch("");
      await fetchRoles();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to assign role");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (roleId: number) => {
    setDeletingId(roleId);
    try {
      const res = await fetch(`/api/admin/roles/${roleId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      await fetchRoles();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to revoke role");
    } finally {
      setDeletingId(null);
    }
  };

  const filteredRoles = filterRole
    ? roles.filter((r) => r.role === filterRole)
    : roles;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Role Assignments</h2>
          <p className="text-sm text-muted-foreground">
            Assign scoped roles to users for managing leagues, divisions, tournaments, and teams.
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "Assign Role"}
        </Button>
      </div>

      {/* Assign Role Form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-border bg-muted/20 p-4 space-y-4"
        >
          <h3 className="font-medium">Assign a Role</h3>

          {/* User Search */}
          <div>
            <label className="block text-sm font-medium mb-1">User</label>
            <input
              type="text"
              placeholder="Search by email or name..."
              value={userSearch}
              onChange={(e) => {
                setUserSearch(e.target.value);
                setFormUserId("");
              }}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            {formUserId && (
              <p className="mt-1 text-xs text-green-600">
                Selected: {userOptions.find((u) => u.id === formUserId)?.email ?? formUserId}
              </p>
            )}
            {userLoading && <p className="mt-1 text-xs text-muted-foreground">Searching...</p>}
            {!userLoading && userOptions.length > 0 && !formUserId && (
              <div className="mt-1 rounded-md border border-border bg-background max-h-40 overflow-y-auto">
                {userOptions.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      setFormUserId(u.id);
                      setUserSearch(u.email);
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 border-b border-border last:border-b-0"
                  >
                    <span className="font-medium">{u.email}</span>
                    {u.name && <span className="text-muted-foreground ml-2">({u.name})</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Role Select */}
          <div>
            <label className="block text-sm font-medium mb-1">Role</label>
            <select
              value={formRole}
              onChange={(e) => setFormRole(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">Select a role...</option>
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          {/* Entity Select */}
          {formRole && (
            <div>
              <label className="block text-sm font-medium mb-1">
                {SCOPE_LABELS[ROLE_OPTIONS.find((r) => r.value === formRole)?.scopeType ?? ""] ?? "Entity"}
              </label>
              {entityLoading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : (
                <select
                  value={formScopeId}
                  onChange={(e) => setFormScopeId(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="">Select...</option>
                  {entityOptions.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {formError && (
            <p className="text-sm text-red-600">{formError}</p>
          )}

          <Button type="submit" disabled={submitting || !formUserId || !formRole || !formScopeId}>
            {submitting ? "Assigning..." : "Assign Role"}
          </Button>
        </form>
      )}

      {/* Filter */}
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium">Filter by role:</label>
        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
        >
          <option value="">All roles</option>
          {ROLE_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <span className="text-sm text-muted-foreground">
          {filteredRoles.length} assignment{filteredRoles.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Loading role assignments...</div>
      ) : filteredRoles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center text-muted-foreground">
          <p className="font-medium">No role assignments found</p>
          <p className="mt-1 text-sm">Click &ldquo;Assign Role&rdquo; to get started.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left px-4 py-3 font-medium">User</th>
                <th className="text-left px-4 py-3 font-medium">Role</th>
                <th className="text-left px-4 py-3 font-medium">Scope</th>
                <th className="text-left px-4 py-3 font-medium">Entity</th>
                <th className="text-left px-4 py-3 font-medium">Assigned</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredRoles.map((role) => (
                <tr key={role.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3 font-mono text-xs">{role.user_id.slice(0, 12)}...</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                      {ROLE_LABELS[role.role] ?? role.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {SCOPE_LABELS[role.scope_type] ?? role.scope_type}
                  </td>
                  <td className="px-4 py-3">{role.entity_name ?? `#${role.scope_id}`}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {new Date(role.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(role.id)}
                      disabled={deletingId === role.id}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      {deletingId === role.id ? "Revoking..." : "Revoke"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
