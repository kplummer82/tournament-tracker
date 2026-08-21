import { sql } from "@/lib/db";
import { POSITIONS } from "@/lib/positions";
import { normalizeDefense, type DefenseAssignment } from "@/lib/lineups/defense";

/**
 * Server helpers for team-scoped reusable defensive lineups.
 *
 * See database/migration_team_lineup_templates.sql for why the nine assignments
 * live in a JSONB payload with no FK on the roster ids, and for the stale-id
 * contract these helpers implement: *tolerated on read, stripped on write*.
 */

export const TEMPLATE_PAYLOAD_VERSION = 1;
export const MAX_TEMPLATES_PER_TEAM = 50;
export const MAX_TEMPLATE_NAME = 60;

export type LineupTemplate = {
  id: number;
  team_id: number;
  name: string;
  version: number;
  defense: DefenseAssignment;
  /** Reserved for a future batting order; always null at version 1. */
  batting: number[] | null;
  /** Ids in `defense` that no longer resolve to a live player on this team. */
  missing_roster_ids: number[];
  created_by: string;
  created_by_name: string | null;
  created_at: string;
  updated_by: string | null;
  updated_by_name: string | null;
  updated_at: string;
};

export type TemplateRow = {
  id: number;
  teamid: number;
  name: string;
  payload: { version?: number; defense?: Record<string, unknown>; batting?: unknown } | null;
  created_by: string;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
};

/* ── Input parsing ─────────────────────────────────────────────── */

export function parseTemplateName(raw: unknown): { name: string } | { error: string } {
  if (typeof raw !== "string") return { error: "Name is required." };
  const name = raw.trim();
  if (!name) return { error: "Name is required." };
  if (name.length > MAX_TEMPLATE_NAME) {
    return { error: `Name must be ${MAX_TEMPLATE_NAME} characters or fewer.` };
  }
  return { name };
}

/**
 * Validates a defense payload against the nine fielding positions in
 * lib/positions.ts. This is the authority — note the games' defensive-lineup
 * route keeps its own wider allow-list that also accepts DH/BN, which nothing
 * else in the app understands; saved lineups deliberately don't.
 *
 * Rejecting the same player at two positions here is what makes it structurally
 * impossible for an import to introduce a duplicate into a game's inning.
 */
export function parseDefenseInput(raw: unknown): { defense: DefenseAssignment } | { error: string } {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return { error: "defense must be an object." };
  }
  const input = raw as Record<string, unknown>;
  const allowed = new Set<string>(POSITIONS);
  const defense: DefenseAssignment = {};
  const seen = new Map<number, string>();

  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) return { error: `Unknown position "${key}".` };
  }

  for (const pos of POSITIONS) {
    const value = input[pos];
    if (value == null) {
      defense[pos] = null;
      continue;
    }
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
      return { error: `Invalid player for ${pos}.` };
    }
    const already = seen.get(value);
    if (already) {
      return { error: `A player can only fill one position (assigned to both ${already} and ${pos}).` };
    }
    seen.set(value, pos);
    defense[pos] = value;
  }

  if (seen.size === 0) return { error: "A saved lineup needs at least one position filled." };
  return { defense };
}

/* ── Roster resolution ─────────────────────────────────────────── */

/**
 * Players who currently exist on this team and may appear in a lineup.
 *
 * Scoping by teamid is a security boundary as well as a correctness one: it
 * stops a crafted payload carrying another team's roster_id from resolving, so
 * a foreign id can never be read back as a name.
 */
export async function loadLivePlayerIds(teamId: number): Promise<Set<number>> {
  const rows = await sql`
    SELECT id FROM public.team_roster
    WHERE teamid = ${teamId} AND role = 'player' AND deleted_at IS NULL
  `;
  return new Set((rows as { id: number }[]).map((r) => Number(r.id)));
}

/** Null out any id that isn't a live player on this team. */
export function stripUnknown(
  defense: DefenseAssignment,
  live: Set<number>
): { defense: DefenseAssignment; dropped: number[] } {
  const out: DefenseAssignment = {};
  const dropped: number[] = [];
  for (const pos of POSITIONS) {
    const id = defense[pos];
    if (id != null && !live.has(id)) {
      dropped.push(id);
      out[pos] = null;
    } else {
      out[pos] = id ?? null;
    }
  }
  return { defense: out, dropped };
}

/* ── Attribution ───────────────────────────────────────────────── */

/**
 * Display names for the created_by / updated_by ids. Neon Auth owns the user
 * table in a managed schema with no FK from ours, so this is a lookup on a text
 * id — same shape as loadTeamManagers in lib/rosterPositions.ts.
 */
export async function loadUserNames(ids: string[]): Promise<Map<string, string | null>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const rows = await sql`
    SELECT id::text AS id, name, email FROM neon_auth."user" WHERE id::text = ANY(${unique})
  `;
  const out = new Map<string, string | null>();
  for (const r of rows as { id: string; name: string | null; email: string | null }[]) {
    out.set(String(r.id), r.name ?? r.email ?? null);
  }
  return out;
}

/* ── Row → DTO ─────────────────────────────────────────────────── */

export function rowToTemplate(
  row: TemplateRow,
  live: Set<number>,
  names: Map<string, string | null>
): LineupTemplate {
  const stored = normalizeDefense(row.payload?.defense ?? {});
  const missing: number[] = [];
  const defense: DefenseAssignment = {};
  for (const pos of POSITIONS) {
    const id = stored[pos];
    if (id != null && !live.has(id)) {
      missing.push(id);
      defense[pos] = null;
    } else {
      defense[pos] = id;
    }
  }
  return {
    id: Number(row.id),
    team_id: Number(row.teamid),
    name: row.name,
    version: Number(row.payload?.version ?? TEMPLATE_PAYLOAD_VERSION),
    defense,
    batting: Array.isArray(row.payload?.batting) ? (row.payload.batting as number[]) : null,
    missing_roster_ids: [...new Set(missing)],
    created_by: row.created_by,
    created_by_name: names.get(row.created_by) ?? null,
    created_at: row.created_at,
    updated_by: row.updated_by,
    updated_by_name: row.updated_by ? names.get(row.updated_by) ?? null : null,
    updated_at: row.updated_at,
  };
}

/** Build the stored payload. Kept in one place so `version` can't drift. */
export function buildPayload(defense: DefenseAssignment) {
  return { version: TEMPLATE_PAYLOAD_VERSION, defense };
}

/* ── Misc ──────────────────────────────────────────────────────── */

/** Postgres unique_violation — the (teamid, lower(btrim(name))) index. */
export function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "23505";
}

export async function countTemplates(teamId: number): Promise<number> {
  const rows = await sql`
    SELECT COUNT(*)::int AS n FROM public.team_lineup_templates WHERE teamid = ${teamId}
  `;
  return Number((rows as { n: number }[])[0]?.n ?? 0);
}

export async function loadTakenNames(teamId: number): Promise<Set<string>> {
  const rows = await sql`
    SELECT lower(btrim(name)) AS key FROM public.team_lineup_templates WHERE teamid = ${teamId}
  `;
  return new Set((rows as { key: string }[]).map((r) => r.key));
}

/**
 * "Jack pitching" → "Jack pitching (copy)" → "(copy 2)" → "(copy 3)"…
 * Returns null if it can't find a free name, which the route turns into a 409
 * rather than looping forever. Truncates to fit the name length cap.
 */
export function nextCopyName(base: string, taken: Set<string>): string | null {
  const room = MAX_TEMPLATE_NAME - " (copy 99)".length;
  const stem = base.length > room ? base.slice(0, room).trim() : base;
  for (let i = 1; i <= 20; i++) {
    const candidate = i === 1 ? `${stem} (copy)` : `${stem} (copy ${i})`;
    if (!taken.has(candidate.toLowerCase().trim())) return candidate;
  }
  return null;
}
