import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const raw = Array.isArray(req.query.tournamentid) ? req.query.tournamentid[0] : req.query.tournamentid;
  const tournamentId = raw != null ? parseInt(String(raw), 10) : NaN;
  if (!Number.isFinite(tournamentId)) {
    return res.status(400).json({ error: "Invalid tournament id" });
  }

  try {
    const rows = await sql`
      SELECT
        MIN(gamedate)::text AS min_date,
        MAX(gamedate)::text AS max_date
      FROM tournamentgames
      WHERE tournamentid = ${tournamentId}
        AND poolorbracket = 'Pool'
    `;
    const { min_date, max_date } = rows[0] ?? {};
    return res.status(200).json({
      minDate: min_date ?? null,
      maxDate: max_date ?? null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("[tournament date-range API]", err);
    return res.status(500).json({ error: message });
  }
}
