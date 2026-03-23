// pages/api/tournaments/[tournamentid]/tiebreakers.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { requireTournamentAccess } from "@/lib/auth/requireSession";

type ApiTB = { id: number; code: string; displayName: string | null; description: string | null; sortDirection: "ASC" | "DESC" };
type ApiSelected = { tiebreakerId: number; priority: number };

function parseTournamentId(req: NextApiRequest): number | null {
  const raw = Array.isArray(req.query.tournamentid)
    ? req.query.tournamentid[0]
    : (req.query.tournamentid as string | undefined);
  if (raw == null) return null;
  const n = Number.parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const tournamentId = parseTournamentId(req);
  if (!tournamentId) return res.status(400).json({ error: "Invalid tournamentid" });

  try {
    if (req.method === "GET") {
      const availRows = (await sql`
        SELECT
          tb.id,
          tb.tiebreaker            AS code,
          tb.display_name          AS display_name,
          tb.tiebreakerdescription AS description,
          COALESCE(tb."SortDirection",'DESC')::text AS sortdirection
        FROM tiebreakers tb
        ORDER BY tb.id
      `) as any[];

      const selRows = (await sql`
        SELECT tiebreakerid, priority
        FROM tournamenttiebreakers
        WHERE tournamentid = ${tournamentId}
        ORDER BY priority ASC
      `) as any[];

      const available: ApiTB[] = availRows.map((r) => ({
        id: Number(r.id),
        code: String(r.code),
        displayName: r.display_name ?? null,
        description: r.description ?? null,
        sortDirection: String(r.sortdirection).toUpperCase() === "ASC" ? "ASC" : "DESC",
      }));

      const selected: ApiSelected[] = selRows.map((r) => ({
        tiebreakerId: Number(r.tiebreakerid),
        priority: Number(r.priority),
      }));

      return res.status(200).json({ available, selected });
    }

    if (req.method === "PUT") {
      const session = await requireTournamentAccess(req, res, tournamentId!);
      if (!session) return;

      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const raw = Array.isArray(body?.tiebreakerIds) ? body.tiebreakerIds : [];
      const ids: number[] = Array.from(
        new Set(raw.map((n: any) => Number(n)).filter((n) => Number.isFinite(n)))
      );

      // Transaction: wipe and insert with new priorities
      await sql`BEGIN`;
      try {
        await sql`DELETE FROM tournamenttiebreakers WHERE tournamentid = ${tournamentId}`;
        for (let i = 0; i < ids.length; i++) {
          const tbId = ids[i];
          const pri = i + 1;
          await sql`
            INSERT INTO tournamenttiebreakers (tournamentid, tiebreakerid, priority)
            VALUES (${tournamentId}, ${tbId}, ${pri})
          `;
        }
        await sql`COMMIT`;
      } catch (e) {
        await sql`ROLLBACK`;
        throw e;
      }

      const selRows = (await sql`
        SELECT tiebreakerid, priority
        FROM tournamenttiebreakers
        WHERE tournamentid = ${tournamentId}
        ORDER BY priority ASC
      `) as any[];

      const selected: ApiSelected[] = selRows.map((r) => ({
        tiebreakerId: Number(r.tiebreakerid),
        priority: Number(r.priority),
      }));

      return res.status(200).json({ ok: true, selected });
    }

    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (err: any) {
    console.error("[tiebreakers API] error", err);
    return res.status(500).json({ error: "Server error" });
  }
}
