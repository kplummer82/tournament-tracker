import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { requireTeamAccess } from "@/lib/auth/requireSession";

function parseParams(req: NextApiRequest) {
  const source = String(req.query.source);
  if (source !== "season" && source !== "tournament" && source !== "scrimmage") return null;
  const gameId = parseInt(String(Array.isArray(req.query.gameId) ? req.query.gameId[0] : req.query.gameId), 10);
  if (!Number.isFinite(gameId)) return null;
  return { source, gameId } as const;
}

function parseTeamId(req: NextApiRequest): number | null {
  const raw = req.method === "GET" ? req.query.team : req.body?.team_id;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

const RULE_KEYS = ["fair_sit", "fair_outfield"] as const;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const params = parseParams(req);
  if (!params) return res.status(400).json({ error: "Invalid source or gameId" });

  const teamId = parseTeamId(req);
  if (!teamId) return res.status(400).json({ error: "team / team_id is required" });

  try {
    if (req.method === "GET") {
      const rows = await sql`
        SELECT rules FROM game_lineup_rules
        WHERE game_source = ${params.source}
          AND game_id = ${params.gameId}
          AND team_id = ${teamId}
      `;
      return res.status(200).json({ rules: rows[0]?.rules ?? {} });
    }

    if (req.method === "PUT") {
      // Only a manager/admin of this team may set its lineup rules (IDOR guard).
      const session = await requireTeamAccess(req, res, teamId);
      if (!session) return;

      const { rules } = req.body ?? {};
      if (rules == null || typeof rules !== "object" || Array.isArray(rules)) {
        return res.status(400).json({ error: "rules object is required" });
      }

      // Whitelist known keys so future league-level keys can't be corrupted by this client
      const clean: Record<string, boolean> = {};
      for (const key of RULE_KEYS) {
        if (typeof rules[key] === "boolean") clean[key] = rules[key];
      }
      const json = JSON.stringify(clean);

      await sql`
        INSERT INTO game_lineup_rules (game_source, game_id, team_id, rules, updated_at)
        VALUES (${params.source}, ${params.gameId}, ${teamId}, ${json}::jsonb, NOW())
        ON CONFLICT (game_source, game_id, team_id)
        DO UPDATE SET rules = ${json}::jsonb, updated_at = NOW()
      `;
      return res.status(200).json({ ok: true, rules: clean });
    }

    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err: unknown) {
    console.error("[lineup-rules] error", err);
    return res.status(500).json({ error: "Server error" });
  }
}
