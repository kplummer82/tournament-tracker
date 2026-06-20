import { sql } from "@/lib/db";
import type { ScopeType } from "@/lib/auth/permissions";

/**
 * Resolve a human-readable label for a scoped entity (for UI/email display).
 * Returns null if the entity can't be found. Shared by the role-assignment and
 * invite routes so both render scopes the same way.
 */
export async function resolveEntityName(
  scopeType: string,
  scopeId: number
): Promise<string | null> {
  try {
    switch (scopeType) {
      case "league": {
        const rows = await sql`SELECT name FROM leagues WHERE id = ${scopeId}`;
        return rows[0]?.name ?? null;
      }
      case "division": {
        const rows = await sql`SELECT ld.name, l.name AS league_name FROM league_divisions ld JOIN leagues l ON l.id = ld.league_id WHERE ld.id = ${scopeId}`;
        return rows[0] ? `${rows[0].league_name} — ${rows[0].name}` : null;
      }
      case "tournament": {
        const rows = await sql`SELECT name FROM tournaments_api WHERE id = ${scopeId}`;
        return rows[0]?.name ?? null;
      }
      case "team": {
        const rows = await sql`SELECT name FROM teams WHERE teamid = ${scopeId}`;
        return rows[0]?.name ?? null;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/** Whether a scoped entity exists. Shared by the role-assignment and invite routes. */
export async function checkEntityExists(
  scopeType: ScopeType,
  scopeId: number
): Promise<boolean> {
  try {
    switch (scopeType) {
      case "league": {
        const rows = await sql`SELECT 1 FROM leagues WHERE id = ${scopeId}`;
        return rows.length > 0;
      }
      case "division": {
        const rows = await sql`SELECT 1 FROM league_divisions WHERE id = ${scopeId}`;
        return rows.length > 0;
      }
      case "tournament": {
        const rows = await sql`SELECT 1 FROM tournaments WHERE tournamentid = ${scopeId}`;
        return rows.length > 0;
      }
      case "team": {
        const rows = await sql`SELECT 1 FROM teams WHERE teamid = ${scopeId}`;
        return rows.length > 0;
      }
      default:
        return false;
    }
  } catch {
    return false;
  }
}
