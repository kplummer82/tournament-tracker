import type { NextApiRequest, NextApiResponse } from "next";
import { requireSession } from "@/lib/auth/requireSession";
import { sql } from "@/lib/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    res.status(405).end("Method Not Allowed");
    return;
  }

  const session = await requireSession(req, res);
  if (!session) return;

  try {
    const roles = await sql`
      SELECT ur.id, ur.role, ur.scope_type, ur.scope_id, ur.created_at
      FROM user_roles ur
      WHERE ur.user_id = ${session.user.id}
      ORDER BY ur.role, ur.scope_type
    `;

    // Resolve entity names for each role
    const enriched = await Promise.all(
      roles.map(async (role: any) => {
        const entityName = await resolveEntityName(role.scope_type, role.scope_id);
        return { ...role, entity_name: entityName };
      })
    );

    res.status(200).json({
      isSystemAdmin: session.user.role === "admin",
      roles: enriched,
    });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message || "Failed to fetch roles" });
  }
}

async function resolveEntityName(scopeType: string, scopeId: number): Promise<string | null> {
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
