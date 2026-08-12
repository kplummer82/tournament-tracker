import { sql } from "@/lib/db";
import { POSITIONS, type Position, type Priority } from "@/lib/positions";
import {
  computeConsensus,
  type ConsensusPriority,
  type ConsensusResult,
  type PositionTally,
} from "@/lib/positionConsensus";

/**
 * Server-side helpers shared by the two roster-position routes. Position
 * ratings are stored per author (`roster_positions.author_user_id`), so every
 * read has to say *whose* set it wants — see `parsePositionView`.
 *
 * These are staff-only data. Both routes gate on `requireTeamAccess`; nothing
 * here re-checks that, so callers must not skip it.
 */

export type PositionRow = {
  roster_id: number;
  author_user_id: string;
  position: Position;
  priority: Priority;
};

export type PositionEntry = { position: string; priority: ConsensusPriority };
export type TeamPositionEntry = { roster_id: number } & PositionEntry;

export type PositionAuthor = {
  user_id: string;
  name: string | null;
  email: string | null;
  is_me: boolean;
  /** How many players on this team the author has rated. */
  rated_players: number;
};

export type PositionView =
  | { view: "mine" }
  | { view: "consensus" }
  | { view: "author"; authorId: string }
  | { view: "all" };

/**
 * `?view=mine` (default) | `consensus` | `author&authorId=…` | `all`.
 * `all` is only meaningful for the single-player route, so callers opt in.
 */
export function parsePositionView(
  query: Record<string, string | string[] | undefined>,
  { allowAll = false }: { allowAll?: boolean } = {}
): PositionView | { error: string } {
  const raw = Array.isArray(query.view) ? query.view[0] : query.view;
  const view = raw ?? "mine";

  if (view === "mine" || view === "consensus") return { view };
  if (view === "all") {
    return allowAll ? { view: "all" } : { error: "view=all is not supported here" };
  }
  if (view === "author") {
    const rawId = Array.isArray(query.authorId) ? query.authorId[0] : query.authorId;
    if (!rawId) return { error: "authorId is required when view=author" };
    return { view: "author", authorId: rawId };
  }
  return { error: "Invalid view" };
}

function toRows(raw: unknown[]): PositionRow[] {
  return (raw as PositionRow[]).map((r) => ({
    roster_id: Number(r.roster_id),
    author_user_id: String(r.author_user_id),
    position: r.position,
    priority: r.priority,
  }));
}

/** Every author's ratings for every player on the team. */
export async function loadTeamPositionRows(teamId: number): Promise<PositionRow[]> {
  const rows = await sql`
    SELECT rp.roster_id, rp.author_user_id, rp.position, rp.priority
    FROM public.roster_positions rp
    JOIN public.team_roster tr ON tr.id = rp.roster_id
    WHERE tr.teamid = ${teamId}
  `;
  return toRows(rows);
}

/** Every author's ratings for one player. */
export async function loadPlayerPositionRows(rosterId: number): Promise<PositionRow[]> {
  const rows = await sql`
    SELECT rp.roster_id, rp.author_user_id, rp.position, rp.priority
    FROM public.roster_positions rp
    WHERE rp.roster_id = ${rosterId}
  `;
  return toRows(rows);
}

export type TeamManager = { user_id: string; name: string | null; email: string | null };

/**
 * The team's current coaches/managers — `team_manager` scoped to this team,
 * exactly what Manage Access lists as "Coach / Manager". These, and only these,
 * are the voices in the position views.
 *
 * The Neon Auth tables live in a managed schema with no FK from ours, so names
 * come from a left join on a text id — same shape as pages/api/admin/roles.
 */
export async function loadTeamManagers(teamId: number): Promise<TeamManager[]> {
  const rows = await sql`
    SELECT DISTINCT ur.user_id, u.name, u.email
    FROM user_roles ur
    LEFT JOIN neon_auth."user" u ON u.id::text = ur.user_id
    WHERE ur.role = 'team_manager'
      AND ur.scope_type = 'team'
      AND ur.scope_id = ${teamId}
  `;
  return (rows as TeamManager[]).map((r) => ({
    user_id: String(r.user_id),
    name: r.name ?? null,
    email: r.email ?? null,
  }));
}

/**
 * Drop ratings authored by anyone who isn't currently a coach of this team.
 *
 * Only a `team_manager` can write, so this normally changes nothing — it
 * matters when someone's role is revoked or they move to another team. Their
 * rows stay in the table (nothing is deleted) but they stop being shown and
 * stop counting toward consensus, which keeps the views consistent with who can
 * actually author today.
 */
export function filterToManagers(rows: PositionRow[], managerIds: Set<string>): PositionRow[] {
  return rows.filter((r) => managerIds.has(r.author_user_id));
}

/**
 * The source-picker list: every current coach/manager of the team, including
 * ones who haven't rated anyone yet (so the picker mirrors the actual staff).
 * Me first, then by display name.
 */
export function buildAuthors(
  managers: TeamManager[],
  rows: PositionRow[],
  meId: string
): PositionAuthor[] {
  const playersByAuthor = new Map<string, Set<number>>();
  for (const r of rows) {
    let set = playersByAuthor.get(r.author_user_id);
    if (!set) {
      set = new Set();
      playersByAuthor.set(r.author_user_id, set);
    }
    set.add(r.roster_id);
  }

  const authors: PositionAuthor[] = managers.map((m) => ({
    user_id: m.user_id,
    name: m.name,
    email: m.email,
    is_me: m.user_id === meId,
    rated_players: playersByAuthor.get(m.user_id)?.size ?? 0,
  }));

  authors.sort((a, b) => {
    if (a.is_me !== b.is_me) return a.is_me ? -1 : 1;
    const an = a.name || a.email || a.user_id;
    const bn = b.name || b.email || b.user_id;
    return an.localeCompare(bn);
  });
  return authors;
}

/** roster_id → author_user_id → position → priority */
export function groupByPlayer(rows: PositionRow[]): Map<number, Map<string, Map<Position, Priority>>> {
  const byPlayer = new Map<number, Map<string, Map<Position, Priority>>>();
  for (const r of rows) {
    let byAuthor = byPlayer.get(r.roster_id);
    if (!byAuthor) {
      byAuthor = new Map();
      byPlayer.set(r.roster_id, byAuthor);
    }
    let ratings = byAuthor.get(r.author_user_id);
    if (!ratings) {
      ratings = new Map();
      byAuthor.set(r.author_user_id, ratings);
    }
    ratings.set(r.position, r.priority);
  }
  return byPlayer;
}

function sortEntries(entries: PositionEntry[]): PositionEntry[] {
  const order = POSITIONS as readonly string[];
  return entries.sort((a, b) => order.indexOf(a.position) - order.indexOf(b.position));
}

/** One author's ratings for one player, in canonical position order. */
export function entriesForAuthor(
  rows: PositionRow[],
  rosterId: number,
  authorId: string
): PositionEntry[] {
  return sortEntries(
    rows
      .filter((r) => r.roster_id === rosterId && r.author_user_id === authorId)
      .map((r) => ({ position: r.position, priority: r.priority as ConsensusPriority }))
  );
}

export type ConsensusPayload = {
  positions: TeamPositionEntry[];
  raters: Record<number, number>;
  tallies: Record<number, Partial<Record<Position, PositionTally>>>;
};

/** Roll every author's ratings up into the consensus view, per player. */
export function buildConsensus(rows: PositionRow[]): ConsensusPayload {
  const byPlayer = groupByPlayer(rows);
  const positions: TeamPositionEntry[] = [];
  const raters: Record<number, number> = {};
  const tallies: Record<number, Partial<Record<Position, PositionTally>>> = {};

  for (const [rosterId, byAuthor] of byPlayer) {
    const result: ConsensusResult = computeConsensus(byAuthor);
    raters[rosterId] = result.raters;
    tallies[rosterId] = result.tallies;
    for (const entry of result.positions) {
      positions.push({ roster_id: rosterId, position: entry.position, priority: entry.priority });
    }
  }
  return { positions, raters, tallies };
}

/** Flatten one author's ratings across the whole team. */
export function teamEntriesForAuthor(rows: PositionRow[], authorId: string): TeamPositionEntry[] {
  return rows
    .filter((r) => r.author_user_id === authorId)
    .map((r) => ({
      roster_id: r.roster_id,
      position: r.position,
      priority: r.priority as ConsensusPriority,
    }));
}

/**
 * Validate an incoming `{ positions: [...] }` body. Unlike the old handler this
 * rejects bad input instead of silently dropping it, so a typo surfaces as a
 * 400 rather than as quietly-missing ratings.
 */
export function parsePositionsBody(
  body: unknown
): { entries: { position: Position; priority: Priority }[] } | { error: string } {
  const raw = (body as { positions?: unknown } | null)?.positions;
  if (!Array.isArray(raw)) return { error: "positions array is required" };

  const seen = new Set<string>();
  const entries: { position: Position; priority: Priority }[] = [];
  for (const item of raw) {
    const entry = item as { position?: unknown; priority?: unknown };
    if (typeof entry?.position !== "string" || !(POSITIONS as readonly string[]).includes(entry.position)) {
      return { error: `Invalid position: ${String(entry?.position)}` };
    }
    if (entry.priority !== "primary" && entry.priority !== "secondary") {
      return { error: `Invalid priority for ${entry.position}: ${String(entry?.priority)}` };
    }
    if (seen.has(entry.position)) {
      return { error: `Duplicate position: ${entry.position}` };
    }
    seen.add(entry.position);
    entries.push({ position: entry.position as Position, priority: entry.priority });
  }
  return { entries };
}
