"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role?: string | null;
};

export default function AdminUsersClient() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

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

  useEffect(() => {
    fetchUsers();
  }, []);

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

  if (loading) {
    return <p className="text-muted-foreground">Loading users…</p>;
  }
  if (error) {
    return <p className="text-destructive">{error}</p>;
  }
  if (users.length === 0) {
    return <p className="text-muted-foreground">No users found.</p>;
  }

  return (
    <div className="rounded-xl border border-border bg-muted/20 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            <th className="text-left p-3 font-medium">Email</th>
            <th className="text-left p-3 font-medium">Name</th>
            <th className="text-left p-3 font-medium">Role</th>
            <th className="text-left p-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const isAdmin = u.role === "admin";
            const isUpdating = updatingId === u.id;
            return (
              <tr key={u.id} className="border-b border-border/50 hover:bg-muted/20">
                <td className="p-3">{u.email}</td>
                <td className="p-3">{u.name ?? "—"}</td>
                <td className="p-3">
                  <span className={isAdmin ? "text-primary font-medium" : "text-muted-foreground"}>
                    {isAdmin ? "Admin" : "User"}
                  </span>
                </td>
                <td className="p-3">
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
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
