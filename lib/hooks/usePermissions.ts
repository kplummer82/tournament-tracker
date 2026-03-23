"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { authClient } from "@/lib/auth/client";

export type UserRoleRow = {
  id: number;
  role: string;
  scope_type: string;
  scope_id: number;
  entity_name: string | null;
};

export type Permissions = {
  isSystemAdmin: boolean;
  roles: UserRoleRow[];
  loading: boolean;
  /** Can write to this league (league_admin or system admin) */
  canEditLeague: (leagueId: number) => boolean;
  /** Can write to this division (division_admin, league_admin on parent, or system admin) */
  canEditDivision: (divisionId: number, leagueId: number) => boolean;
  /** Can write to this season (via division or league) */
  canEditSeason: (leagueId: number, divisionId: number) => boolean;
  /** Can write to this tournament (tournament_admin or system admin) */
  canEditTournament: (tournamentId: number) => boolean;
  /** Can write to this team (team_manager, division_admin, league_admin, or system admin) */
  canEditTeam: (teamId: number, leagueId?: number | null, divisionId?: number | null) => boolean;
  /** Can assign roles for this scope (admin at or above this level) */
  canAssignRoles: (scopeType: string, scopeId: number) => boolean;
  /** True if user has any scoped role */
  hasAnyRole: boolean;
  /** Refresh permissions from server */
  refresh: () => Promise<void>;
};

export function usePermissions(): Permissions {
  const { data: session } = authClient.useSession();
  const [roles, setRoles] = useState<UserRoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const isSystemAdmin = session?.user?.role === "admin";

  const fetchRoles = useCallback(async () => {
    if (!session?.user) {
      setRoles([]);
      setLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/me/roles", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setRoles(data.roles ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [session?.user]);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  const permissions = useMemo<Permissions>(() => {
    const canEditLeague = (leagueId: number) => {
      if (isSystemAdmin) return true;
      return roles.some(
        (r) => r.role === "league_admin" && r.scope_type === "league" && r.scope_id === leagueId
      );
    };

    const canEditDivision = (divisionId: number, leagueId: number) => {
      if (isSystemAdmin) return true;
      return roles.some(
        (r) =>
          (r.role === "league_admin" && r.scope_type === "league" && r.scope_id === leagueId) ||
          (r.role === "division_admin" && r.scope_type === "division" && r.scope_id === divisionId)
      );
    };

    const canEditSeason = (leagueId: number, divisionId: number) => {
      return canEditDivision(divisionId, leagueId);
    };

    const canEditTournament = (tournamentId: number) => {
      if (isSystemAdmin) return true;
      return roles.some(
        (r) =>
          r.role === "tournament_admin" &&
          r.scope_type === "tournament" &&
          r.scope_id === tournamentId
      );
    };

    const canEditTeam = (
      teamId: number,
      leagueId?: number | null,
      divisionId?: number | null
    ) => {
      if (isSystemAdmin) return true;
      return roles.some(
        (r) =>
          (r.role === "team_manager" && r.scope_type === "team" && r.scope_id === teamId) ||
          (leagueId != null &&
            r.role === "league_admin" &&
            r.scope_type === "league" &&
            r.scope_id === leagueId) ||
          (divisionId != null &&
            r.role === "division_admin" &&
            r.scope_type === "division" &&
            r.scope_id === divisionId)
      );
    };

    const canAssignRoles = (scopeType: string, scopeId: number) => {
      if (isSystemAdmin) return true;
      // League admin can assign within their league
      if (scopeType === "league") {
        return canEditLeague(scopeId);
      }
      // Division admin can assign within their division
      if (scopeType === "division") {
        return roles.some(
          (r) =>
            (r.role === "division_admin" && r.scope_type === "division" && r.scope_id === scopeId) ||
            (r.role === "league_admin" && r.scope_type === "league")
          // Note: this is a rough check — the league_admin check should verify
          // the division belongs to their league. For full accuracy, ancestry
          // would be needed, but for UI visibility this is sufficient.
        );
      }
      if (scopeType === "tournament") {
        return canEditTournament(scopeId);
      }
      return false;
    };

    return {
      isSystemAdmin,
      roles,
      loading,
      canEditLeague,
      canEditDivision,
      canEditSeason,
      canEditTournament,
      canEditTeam,
      canAssignRoles,
      hasAnyRole: isSystemAdmin || roles.length > 0,
      refresh: fetchRoles,
    };
  }, [isSystemAdmin, roles, loading, fetchRoles]);

  return permissions;
}
