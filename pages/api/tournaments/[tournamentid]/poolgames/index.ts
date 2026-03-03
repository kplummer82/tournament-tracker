import type { NextApiRequest, NextApiResponse } from "next";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const tournamentid = Number(req.query.tournamentid);
  if (!Number.isFinite(tournamentid)) return res.status(400).json({ error: "Invalid tournament id" });

  try {
    if (req.method === "GET") {
      const client = await pool.connect();
      try {
        const r = await client.query(
          `select * from poolgames_view where tournamentid = $1 order by gamedate, gametime, id`,
          [tournamentid]
        );
        return res.status(200).json({ games: r.rows });
      } finally {
        client.release();
      }
    }

    if (req.method === "POST") {
      const {
        hometeam, awayteam, gamedate, gametime,
        homescore = null, awayscore = null, gamestatusid,
      } = req.body ?? {};

      if (!hometeam || !awayteam || !gamedate || !gametime || !gamestatusid) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const time = String(gametime).length === 5 ? `${gametime}:00` : String(gametime);

      const client = await pool.connect();
      try {
        await client.query(
          `
          insert into poolgames_view
            (tournamentid, gamedate, gametime, hometeam, awayteam, homescore, awayscore, gamestatusid)
          values ($1, $2::date, $3::time, $4, $5, $6, $7, $8)
          `,
          [
            tournamentid, gamedate, time, hometeam, awayteam,
            homescore === null ? null : Number(homescore),
            awayscore === null ? null : Number(awayscore),
            Number(gamestatusid),
          ]
        );
        return res.status(201).json({ ok: true });
      } catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Failed to create game" });
      }
      finally { /* eslint-disable no-unsafe-finally */ /* handled above */ }
    }

    if (req.method === "PUT") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {};
      const {
        id,
        home, away, gamedate, gametime,
        homescore = null, awayscore = null, gamestatusid,
      } = body;

      if (!id) return res.status(400).json({ error: "Missing game id" });
      if (home == null || away == null || !gamedate || !gametime) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const time = String(gametime).length === 5 ? `${gametime}:00` : String(gametime);
      const dateStr = String(gamedate).slice(0, 10);

      const client = await pool.connect();
      const baseParams = [
        dateStr, time, Number(home), Number(away),
        homescore === null ? null : Number(homescore),
        awayscore === null ? null : Number(awayscore),
        Number(id),
        tournamentid,
      ];
      try {
        const r = await client.query(
          `
          UPDATE tournamentgames
             SET gamedate   = $1::date,
                 gametime   = $2::time,
                 home       = $3,
                 away       = $4,
                 homescore  = $5,
                 awayscore  = $6,
                 gamestatus = $7
           WHERE id = $8 AND tournamentid = $9 AND poolorbracket = 'Pool'
          `,
          [
            dateStr, time, Number(home), Number(away),
            homescore === null ? null : Number(homescore),
            awayscore === null ? null : Number(awayscore),
            gamestatusid != null && gamestatusid !== "" ? Number(gamestatusid) : null,
            Number(id),
            tournamentid,
          ]
        );
        if (!r.rowCount) return res.status(404).json({ error: "Game not found" });
        return res.status(200).json({ ok: true });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "";
        if ((msg.includes("gamestatusid") || msg.includes("gamestatus")) && msg.includes("does not exist")) {
          try {
            const r2 = await client.query(
              `
              UPDATE tournamentgames
                 SET gamedate  = $1::date,
                     gametime  = $2::time,
                     home      = $3,
                     away      = $4,
                     homescore = $5,
                     awayscore = $6
               WHERE id = $7 AND tournamentid = $8 AND poolorbracket = 'Pool'
              `,
              baseParams
            );
            if (r2.rowCount) {
              return res.status(200).json({
                ok: true,
                statusNotSaved: true,
                message:
                  "Game updated. Status was not saved because the database is missing the gamestatusid column. Run in Neon SQL editor: ALTER TABLE public.tournamentgames ADD COLUMN IF NOT EXISTS gamestatusid integer;",
              });
            }
          } catch (e2) {
            console.error("PUT poolgames fallback error:", e2);
          }
        }
        console.error("PUT poolgames error:", e);
        return res.status(500).json({ error: msg || "Failed to update game" });
      } finally {
        client.release();
      }
    }

    res.setHeader("Allow", "GET, POST, PUT");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
}
