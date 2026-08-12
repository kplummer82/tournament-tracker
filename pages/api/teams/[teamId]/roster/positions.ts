import type { NextApiRequest, NextApiResponse } from "next";
import { requireTeamAccess } from "@/lib/auth/requireSession";
import type { Position } from "@/lib/positions";
import type { PositionTally } from "@/lib/positionConsensus";
import {
  buildAuthors,
  buildConsensus,
  filterToManagers,
  loadTeamManagers,
  loadTeamPositionRows,
  parsePositionView,
  teamEntriesForAuthor,
  type PositionAuthor,
  type TeamPositionEntry,
} from "@/lib/rosterPositions";

export type { PositionAuthor, TeamPositionEntry };

export type TeamPositionsResponse = {
  view: "mine" | "consensus" | "author";
  authorId?: string;
  positions: TeamPositionEntry[];
  authors: PositionAuthor[];
  /** Whether the caller may keep a set of their own — coaches/managers only. */
  canAuthor: boolean;
  /** Consensus view only: how many coaches rated each player. */
  raters?: Record<number, number>;
  /** Consensus view only: per-position vote breakdown, for chip tooltips. */
  tallies?: Record<number, Partial<Record<Position, PositionTally>>>;
};

function parseId(val: string | string[] | undefined): number | null {
  const raw = Array.isArray(val) ? val[0] : val;
  if (raw == null) return null;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const teamId = parseId(req.query.teamId);
  if (!teamId) return res.status(400).json({ error: "Invalid teamId" });

  // Reading is open to all staff — admins, the team's managers, and
  // league/division admins over it. Authoring is narrower (see canAuthor).
  const session = await requireTeamAccess(req, res, teamId);
  if (!session) return;

  const parsed = parsePositionView(req.query);
  if ("error" in parsed) return res.status(400).json({ error: parsed.error });

  try {
    const [managers, allRows] = await Promise.all([
      loadTeamManagers(teamId),
      loadTeamPositionRows(teamId),
    ]);
    const managerIds = new Set(managers.map((m) => m.user_id));
    const canAuthor = managerIds.has(session.user.id);
    // Only current coaches of this team are voices here — see filterToManagers.
    const rows = filterToManagers(allRows, managerIds);
    const authors = buildAuthors(managers, rows, session.user.id);

    if (parsed.view === "consensus") {
      const { positions, raters, tallies } = buildConsensus(rows);
      const payload: TeamPositionsResponse = {
        view: "consensus", positions, authors, canAuthor, raters, tallies,
      };
      return res.status(200).json(payload);
    }

    const authorId = parsed.view === "author" ? parsed.authorId : session.user.id;
    const payload: TeamPositionsResponse = {
      view: parsed.view === "author" ? "author" : "mine",
      authorId,
      positions: teamEntriesForAuthor(rows, authorId),
      authors,
      canAuthor,
    };
    return res.status(200).json(payload);
  } catch (err) {
    console.error("[roster positions GET]", err);
    return res.status(500).json({ error: "Server error" });
  }
}
