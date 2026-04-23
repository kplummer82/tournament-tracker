import type { NextApiRequest, NextApiResponse } from "next";
import { requireSession } from "@/lib/auth/requireSession";
import { sql } from "@/lib/db";

const VALID_TYPES = ["team", "league", "division", "tournament"] as const;
type EntityType = (typeof VALID_TYPES)[number];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await requireSession(req, res);
  if (!session) return;

  const userId = session.user.id;

  try {
    switch (req.method) {
      case "GET":
        return handleGet(userId, res);
      case "POST":
        return handlePost(userId, req, res);
      case "DELETE":
        return handleDelete(userId, req, res);
      default:
        res.setHeader("Allow", ["GET", "POST", "DELETE"]);
        return res.status(405).end("Method Not Allowed");
    }
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Internal error" });
  }
}

async function handleGet(userId: string, res: NextApiResponse) {
  const [teams, leagues, divisions, tournaments] = await Promise.all([
    sql`
      SELECT t.teamid AS id, t.name
      FROM user_follows uf
      JOIN teams t ON t.teamid = uf.entity_id
      WHERE uf.user_id = ${userId} AND uf.entity_type = 'team'
      ORDER BY t.name
    `,
    sql`
      SELECT l.id, l.name
      FROM user_follows uf
      JOIN leagues l ON l.id = uf.entity_id
      WHERE uf.user_id = ${userId} AND uf.entity_type = 'league'
      ORDER BY l.name
    `,
    sql`
      SELECT ld.id, ld.name, ld.league_id, l.name AS league_name
      FROM user_follows uf
      JOIN league_divisions ld ON ld.id = uf.entity_id
      JOIN leagues l ON l.id = ld.league_id
      WHERE uf.user_id = ${userId} AND uf.entity_type = 'division'
      ORDER BY l.name, ld.sort_order, ld.name
    `,
    sql`
      SELECT t.tournamentid AS id, t.name
      FROM user_follows uf
      JOIN tournaments t ON t.tournamentid = uf.entity_id
      WHERE uf.user_id = ${userId} AND uf.entity_type = 'tournament'
      ORDER BY t.name
    `,
  ]);

  return res.status(200).json({ teams, leagues, divisions, tournaments });
}

async function handlePost(userId: string, req: NextApiRequest, res: NextApiResponse) {
  const { entityType, entityId } = req.body ?? {};
  if (!VALID_TYPES.includes(entityType) || typeof entityId !== "number") {
    return res.status(400).json({ error: "entityType and entityId (number) required" });
  }

  await sql`
    INSERT INTO user_follows (user_id, entity_type, entity_id)
    VALUES (${userId}, ${entityType}, ${entityId})
    ON CONFLICT DO NOTHING
  `;

  return res.status(200).json({ ok: true });
}

async function handleDelete(userId: string, req: NextApiRequest, res: NextApiResponse) {
  const entityType = (req.query.entityType ?? req.body?.entityType) as string;
  const entityId = Number(req.query.entityId ?? req.body?.entityId);
  if (!VALID_TYPES.includes(entityType as EntityType) || !entityId) {
    return res.status(400).json({ error: "entityType and entityId required" });
  }

  await sql`
    DELETE FROM user_follows
    WHERE user_id = ${userId} AND entity_type = ${entityType} AND entity_id = ${entityId}
  `;

  return res.status(200).json({ ok: true });
}
