import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { fetchTournamentStandingsData } from "@/lib/standings";
import { validateCoinTossSubmission } from "@/lib/standings/coinTossService";
import { requireTournamentAccess } from "@/lib/auth/requireSession";

function parseTournamentId(req: NextApiRequest): number | null {
  const raw = Array.isArray(req.query.tournamentid)
    ? req.query.tournamentid[0]
    : (req.query.tournamentid as string | undefined);
  if (raw == null) return null;
  const n = Number.parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

async function poolGroupMap(tournamentId: number): Promise<Map<number, string | null>> {
  const rows = (await sql`
    SELECT teamid, pool_group
    FROM public.tournamentteams
    WHERE tournamentid = ${tournamentId}
  `) as { teamid: number; pool_group: string | null }[];
  return new Map(rows.map((r) => [Number(r.teamid), r.pool_group ?? null]));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const tournamentId = parseTournamentId(req);
  if (!tournamentId) return res.status(400).json({ error: "Invalid tournamentid" });

  try {
    if (req.method === "PUT") {
      const session = await requireTournamentAccess(req, res, tournamentId);
      if (!session) return;

      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const groupSig = typeof body?.groupSig === "string" ? body.groupSig : null;
      const order: number[] = Array.isArray(body?.order)
        ? body.order.map((n: unknown) => Number(n)).filter((n: number) => Number.isFinite(n))
        : [];
      if (!groupSig) return res.status(400).json({ error: "Missing groupSig" });

      const data = await fetchTournamentStandingsData(tournamentId);
      const groupMap = await poolGroupMap(tournamentId);
      const check = validateCoinTossSubmission(
        groupSig,
        order,
        data.games,
        data.teams,
        data.tiebreakers,
        data.config,
        groupMap
      );
      if (check.ok === false) return res.status(409).json({ error: check.error });

      await sql`BEGIN`;
      try {
        await sql`
          DELETE FROM coin_toss_results
          WHERE scope = 'tournament' AND scope_id = ${tournamentId} AND group_sig = ${groupSig}
        `;
        for (let i = 0; i < order.length; i++) {
          await sql`
            INSERT INTO coin_toss_results (scope, scope_id, group_sig, teamid, seed_order)
            VALUES ('tournament', ${tournamentId}, ${groupSig}, ${order[i]}, ${i + 1})
          `;
        }
        await sql`COMMIT`;
      } catch (e) {
        await sql`ROLLBACK`;
        throw e;
      }

      return res.status(200).json({ ok: true });
    }

    if (req.method === "DELETE") {
      const session = await requireTournamentAccess(req, res, tournamentId);
      if (!session) return;

      const rawSig = Array.isArray(req.query.groupSig) ? req.query.groupSig[0] : req.query.groupSig;
      const groupSig = typeof rawSig === "string" && rawSig.trim() !== "" ? rawSig.trim() : null;
      if (!groupSig) return res.status(400).json({ error: "Missing groupSig" });

      await sql`
        DELETE FROM coin_toss_results
        WHERE scope = 'tournament' AND scope_id = ${tournamentId} AND group_sig = ${groupSig}
      `;
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "PUT, DELETE");
    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("[tournament coin-toss API]", err);
    return res.status(500).json({ error: message });
  }
}
