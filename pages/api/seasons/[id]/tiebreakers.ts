import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";

function parseSeasonId(req: NextApiRequest): number | null {
  const raw = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  const n = parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) ? n : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const seasonId = parseSeasonId(req);
  if (!seasonId) return res.status(400).json({ error: "Invalid season id" });

  try {
    if (req.method === "GET") {
      const availRows = (await sql`
        SELECT
          tb.id,
          tb.tiebreaker              AS code,
          tb.tiebreakerdescription   AS description,
          COALESCE(tb."SortDirection",'DESC')::text AS sortdirection
        FROM tiebreakers tb
        ORDER BY tb.id
      `) as any[];

      const selRows = (await sql`
        SELECT tiebreaker_id, priority
        FROM season_tiebreakers
        WHERE season_id = ${seasonId}
        ORDER BY priority ASC
      `) as any[];

      const available = availRows.map((r: any) => ({
        id: Number(r.id),
        code: String(r.code),
        description: r.description ?? null,
        sortDirection: String(r.sortdirection).toUpperCase() === "ASC" ? "ASC" : "DESC",
      }));

      const selected = selRows.map((r: any) => ({
        tiebreakerId: Number(r.tiebreaker_id),
        priority: Number(r.priority),
      }));

      return res.status(200).json({ available, selected });
    }

    if (req.method === "PUT") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const raw = Array.isArray(body?.tiebreakerIds) ? body.tiebreakerIds : [];
      const ids: number[] = Array.from(
        new Set(raw.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n)))
      );

      await sql`BEGIN`;
      try {
        await sql`DELETE FROM season_tiebreakers WHERE season_id = ${seasonId}`;
        for (let i = 0; i < ids.length; i++) {
          const tbId = ids[i];
          const pri = i + 1;
          await sql`
            INSERT INTO season_tiebreakers (season_id, tiebreaker_id, priority)
            VALUES (${seasonId}, ${tbId}, ${pri})
          `;
        }
        await sql`COMMIT`;
      } catch (e) {
        await sql`ROLLBACK`;
        throw e;
      }

      const selRows = (await sql`
        SELECT tiebreaker_id, priority
        FROM season_tiebreakers
        WHERE season_id = ${seasonId}
        ORDER BY priority ASC
      `) as any[];

      const selected = selRows.map((r: any) => ({
        tiebreakerId: Number(r.tiebreaker_id),
        priority: Number(r.priority),
      }));

      return res.status(200).json({ ok: true, selected });
    }

    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (err: any) {
    console.error("[season tiebreakers API] error", err);
    return res.status(500).json({ error: err.message ?? "Server error" });
  }
}
