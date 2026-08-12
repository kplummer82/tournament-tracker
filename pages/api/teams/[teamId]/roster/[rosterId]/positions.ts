import type { NextApiRequest, NextApiResponse } from "next";
import { pool, sql } from "@/lib/db";
import { requireTeamAccess, requireTeamManager } from "@/lib/auth/requireSession";
import type { Position } from "@/lib/positions";
import { computeConsensus, type PositionTally } from "@/lib/positionConsensus";
import {
  buildAuthors,
  entriesForAuthor,
  filterToManagers,
  groupByPlayer,
  loadPlayerPositionRows,
  loadTeamManagers,
  parsePositionsBody,
  parsePositionView,
  type PositionAuthor,
  type PositionEntry,
} from "@/lib/rosterPositions";

export type { PositionAuthor, PositionEntry };

export type PlayerPositionsResponse = {
  view: "mine" | "consensus" | "author";
  authorId?: string;
  positions: PositionEntry[];
  authors: PositionAuthor[];
  /** Whether the caller may keep a set of their own — coaches/managers only. */
  canAuthor: boolean;
  raters?: number;
  tallies?: Partial<Record<Position, PositionTally>>;
};

/** `?view=all` — every author's set for this player, for the comparison strip. */
export type PlayerPositionsAllResponse = {
  view: "all";
  authors: PositionAuthor[];
  canAuthor: boolean;
  byAuthor: Record<string, PositionEntry[]>;
  consensus: {
    positions: PositionEntry[];
    raters: number;
    tallies: Partial<Record<Position, PositionTally>>;
  };
};

function parseId(val: string | string[] | undefined): number | null {
  const raw = Array.isArray(val) ? val[0] : val;
  if (raw == null) return null;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const teamId = parseId(req.query.teamId);
  const rosterId = parseId(req.query.rosterId);
  if (!teamId) return res.status(400).json({ error: "Invalid teamId" });
  if (!rosterId) return res.status(400).json({ error: "Invalid rosterId" });

  if (req.method !== "GET" && req.method !== "PUT") {
    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // Position ratings are coaching evaluations — staff only, on read as well as
  // write. Reading is open to every kind of admin; writing is restricted to
  // this team's coaches/managers. Runs before the roster lookup so a wrong team
  // can't be probed.
  const session =
    req.method === "GET"
      ? await requireTeamAccess(req, res, teamId)
      : await requireTeamManager(req, res, teamId);
  if (!session) return;

  // Verify roster entry belongs to this team
  const ownerCheck = await sql`
    SELECT id FROM public.team_roster WHERE id = ${rosterId} AND teamid = ${teamId} LIMIT 1
  `;
  if (!ownerCheck?.length) return res.status(404).json({ error: "Roster entry not found." });

  /* ── GET ────────────────────────────────────────────────────── */
  if (req.method === "GET") {
    const parsed = parsePositionView(req.query, { allowAll: true });
    if ("error" in parsed) return res.status(400).json({ error: parsed.error });

    try {
      const [managers, allRows] = await Promise.all([
        loadTeamManagers(teamId),
        loadPlayerPositionRows(rosterId),
      ]);
      const managerIds = new Set(managers.map((m) => m.user_id));
      const canAuthor = managerIds.has(session.user.id);
      // Only current coaches of this team are voices here — see filterToManagers.
      const rows = filterToManagers(allRows, managerIds);
      const authors = buildAuthors(managers, rows, session.user.id);
      const ratingsByAuthor = groupByPlayer(rows).get(rosterId) ?? new Map();
      const consensus = computeConsensus(ratingsByAuthor);

      if (parsed.view === "all") {
        const byAuthor: Record<string, PositionEntry[]> = {};
        for (const author of authors) {
          byAuthor[author.user_id] = entriesForAuthor(rows, rosterId, author.user_id);
        }
        const payload: PlayerPositionsAllResponse = {
          view: "all",
          authors,
          canAuthor,
          byAuthor,
          consensus: {
            positions: consensus.positions.map((e) => ({ position: e.position, priority: e.priority })),
            raters: consensus.raters,
            tallies: consensus.tallies,
          },
        };
        return res.status(200).json(payload);
      }

      if (parsed.view === "consensus") {
        const payload: PlayerPositionsResponse = {
          view: "consensus",
          positions: consensus.positions.map((e) => ({ position: e.position, priority: e.priority })),
          authors,
          canAuthor,
          raters: consensus.raters,
          tallies: consensus.tallies,
        };
        return res.status(200).json(payload);
      }

      const authorId = parsed.view === "author" ? parsed.authorId : session.user.id;
      const payload: PlayerPositionsResponse = {
        view: parsed.view === "author" ? "author" : "mine",
        authorId,
        positions: entriesForAuthor(rows, rosterId, authorId),
        authors,
        canAuthor,
      };
      return res.status(200).json(payload);
    } catch (err) {
      console.error("[positions GET]", err);
      return res.status(500).json({ error: "Server error" });
    }
  }

  /* ── PUT ────────────────────────────────────────────────────── */
  // Always writes the caller's own set. Any authorId in the body is ignored —
  // nobody edits another coach's ratings on their behalf.
  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  const parsedBody = parsePositionsBody(body);
  if ("error" in parsedBody) return res.status(400).json({ error: parsedBody.error });

  const authorId = session.user.id;

  // The Neon HTTP `sql` tag is stateless per call, so the delete + inserts must
  // share one connection to be atomic — otherwise a mid-write failure leaves
  // the coach with no ratings at all.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "DELETE FROM public.roster_positions WHERE roster_id = $1 AND author_user_id = $2",
      [rosterId, authorId]
    );
    if (parsedBody.entries.length > 0) {
      const values: unknown[] = [];
      const tuples = parsedBody.entries.map((e, i) => {
        values.push(rosterId, authorId, e.position, e.priority);
        const b = i * 4;
        return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, NOW())`;
      });
      await client.query(
        `INSERT INTO public.roster_positions (roster_id, author_user_id, position, priority, updated_at)
         VALUES ${tuples.join(", ")}`,
        values
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    client.release();
    console.error("[positions PUT]", err);
    return res.status(500).json({ error: "Server error" });
  }
  client.release();

  try {
    const [managers, allRows] = await Promise.all([
      loadTeamManagers(teamId),
      loadPlayerPositionRows(rosterId),
    ]);
    const rows = filterToManagers(allRows, new Set(managers.map((m) => m.user_id)));
    const payload: PlayerPositionsResponse = {
      view: "mine",
      authorId,
      positions: entriesForAuthor(rows, rosterId, authorId),
      authors: buildAuthors(managers, rows, authorId),
      canAuthor: true, // requireTeamManager already passed
    };
    return res.status(200).json(payload);
  } catch (err) {
    console.error("[positions PUT read-back]", err);
    return res.status(500).json({ error: "Server error" });
  }
}
