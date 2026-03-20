"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role?: string | null;
  pending?: boolean;
  userStatus?: string;
};

export default function AdminUsersClient() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [approvalLoading, setApprovalLoading] = useState(true);
  const [approvalToggling, setApprovalToggling] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", { credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      const list = data?.data?.users ?? data?.users ?? [];
      setUsers(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/admin/settings", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setApprovalRequired(data.settings?.require_user_approval ?? false);
      }
    } catch {
      // ignore — default to false
    } finally {
      setApprovalLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchSettings();
  }, []);

  const toggleApproval = async () => {
    setApprovalToggling(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ require_user_approval: !approvalRequired }),
      });
      if (res.ok) {
        const data = await res.json();
        setApprovalRequired(data.settings?.require_user_approval ?? false);
      }
    } catch {
      // ignore
    } finally {
      setApprovalToggling(false);
    }
  };

  const setRole = async (userId: string, role: "admin" | "user") => {
    setUpdatingId(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to update role");
      }
      await fetchUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update role");
    } finally {
      setUpdatingId(null);
    }
  };

  const toggleStatus = async (userId: string, currentStatus: string) => {
    setUpdatingId(userId);
    const newStatus = currentStatus === "active" ? "inactive" : "active";
    try {
      const res = await fetch(`/api/admin/users/${userId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to update status");
      }
      await fetchUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update status");
    } finally {
      setUpdatingId(null);
    }
  };

  // Sort: pending users first, then by email
  const sortedUsers = [...users].sort((a, b) => {
    if (a.pending && !b.pending) return -1;
    if (!a.pending && b.pending) return 1;
    return (a.email ?? "").localeCompare(b.email ?? "");
  });

  const pendingCount = users.filter((u) => u.pending).length;

  if (loading) {
    return <p className="text-muted-foreground">Loading users…</p>;
  }
  if (error) {
    return <p className="text-destructive">{error}</p>;
  }

  return (
    <div className="space-y-4">
      {/* Approval mode toggle */}
      {!approvalLoading && (
        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-4 py-3">
          <div>
            <p className="text-sm font-medium">Require approval for new users</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {approvalRequired
                ? "New sign-ups must be approved before they can access the app."
                : "New sign-ups get immediate access."}
            </p>
          </div>
          <button
            onClick={toggleApproval}
            disabled={approvalToggling}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50 ${
              approvalRequired ? "bg-primary" : "bg-muted-foreground/30"
            }`}
            role="switch"
            aria-checked={approvalRequired}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transform transition-transform duration-200 ${
                approvalRequired ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      )}

      {/* Inactive users badge */}
      {pendingCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5">
          <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-amber-500 text-white text-xs font-semibold">
            {pendingCount}
          </span>
          <span className="text-sm text-amber-700 dark:text-amber-400">
            {pendingCount === 1 ? "user is" : "users are"} inactive
          </span>
        </div>
      )}

      {/* Users table */}
      {users.length === 0 ? (
        <p className="text-muted-foreground">No users found.</p>
      ) : (
        <div className="rounded-xl border border-border bg-muted/20 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left p-3 font-medium">Email</th>
                <th className="text-left p-3 font-medium">Name</th>
                <th className="text-left p-3 font-medium">Role</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedUsers.map((u) => {
                const isAdmin = u.role === "admin";
                const isPending = !!u.pending;
                const userStatus = u.userStatus ?? "active";
                const isActive = userStatus === "active";
                const isUpdating = updatingId === u.id;
                return (
                  <tr key={u.id} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="p-3">{u.email}</td>
                    <td className="p-3">{u.name ?? "—"}</td>
                    <td className="p-3">
                      {isAdmin ? (
                        <span className="text-primary font-medium">Admin</span>
                      ) : (
                        <span className="text-muted-foreground">User</span>
                      )}
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => toggleStatus(u.id, userStatus)}
                        disabled={isUpdating}
                        className="inline-flex items-center gap-1.5 text-xs font-medium disabled:opacity-50"
                      >
                        {isActive ? (
                          <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                            <span className="h-2 w-2 rounded-full bg-emerald-500" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                            <span className="h-2 w-2 rounded-full bg-amber-500" />
                            Inactive
                          </span>
                        )}
                      </button>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        {isAdmin ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isUpdating}
                            onClick={() => setRole(u.id, "user")}
                          >
                            {isUpdating ? "Updating…" : "Remove admin"}
                          </Button>
                        ) : (
                          <Button
                            variant="default"
                            size="sm"
                            disabled={isUpdating}
                            onClick={() => setRole(u.id, "admin")}
                          >
                            {isUpdating ? "Updating…" : "Make admin"}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
