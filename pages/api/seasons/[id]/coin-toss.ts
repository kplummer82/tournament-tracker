import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { fetchSeasonStandingsData } from "@/lib/standings";
import { validateCoinTossSubmission } from "@/lib/standings/coinTossService";
import { requireSeasonAccess } from "@/lib/auth/requireSession";

function parseSeasonId(req: NextApiRequest): number | null {
  const raw = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  const n = parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) ? n : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const seasonId = parseSeasonId(req);
  if (!seasonId) return res.status(400).json({ error: "Invalid season id" });

  try {
    if (req.method === "PUT") {
      const session = await requireSeasonAccess(req, res, seasonId);
      if (!session) return;

      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const groupSig = typeof body?.groupSig === "string" ? body.groupSig : null;
      const order: number[] = Array.isArray(body?.order)
        ? body.order.map((n: unknown) => Number(n)).filter((n: number) => Number.isFinite(n))
        : [];
      if (!groupSig) return res.status(400).json({ error: "Missing groupSig" });

      // Re-detect groups and validate the submission against current standings.
      const data = await fetchSeasonStandingsData(seasonId, { includeInProgress: false });
      const check = validateCoinTossSubmission(
        groupSig,
        order,
        data.games,
        data.teams,
        data.tiebreakers,
        data.config
      );
      if (check.ok === false) return res.status(409).json({ error: check.error });

      await sql`BEGIN`;
      try {
        await sql`
          DELETE FROM coin_toss_results
          WHERE scope = 'season' AND scope_id = ${seasonId} AND group_sig = ${groupSig}
        `;
        for (let i = 0; i < order.length; i++) {
          await sql`
            INSERT INTO coin_toss_results (scope, scope_id, group_sig, teamid, seed_order)
            VALUES ('season', ${seasonId}, ${groupSig}, ${order[i]}, ${i + 1})
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
      const session = await requireSeasonAccess(req, res, seasonId);
      if (!session) return;

      const rawSig = Array.isArray(req.query.groupSig) ? req.query.groupSig[0] : req.query.groupSig;
      const groupSig = typeof rawSig === "string" && rawSig.trim() !== "" ? rawSig.trim() : null;
      if (!groupSig) return res.status(400).json({ error: "Missing groupSig" });

      await sql`
        DELETE FROM coin_toss_results
        WHERE scope = 'season' AND scope_id = ${seasonId} AND group_sig = ${groupSig}
      `;
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "PUT, DELETE");
    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("[season coin-toss API]", err);
    return res.status(500).json({ error: message });
  }
}
