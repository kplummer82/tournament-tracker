import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";

/** Shape returned from the view.
 *  Includes back-compat aliases: tournamentid, tournamentstatus, tournamentvisibility.
 */
type Row = {
  id: number;
  tournamentid: number;             // alias for back-compat
  name: string | null;
  city: string | null;
  state: string | null;
  year: number | null;
  maxrundiff: number | null;
  advances_per_group: number | null;
  num_pool_groups: number | null;

  // readable labels from the view
  division: string | null;
  sport: string | null;
  tournamentstatus: string | null;   // alias of view column "status"
  tournamentvisibility: string | null; // alias of view column "visibility"

  // writable id fields exposed by the view
  divisionid: number | null;
  sportid: number | null;
  statusid: number | null;
  visibilityid: number | null;

  created_at: string | null;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { tournamentid } = req.query;
  const id = Number(tournamentid);
  if (!id || Number.isNaN(id)) return res.status(400).json({ error: "Invalid tournamentid" });

  try {
    if (req.method === "GET") {
        const rows = (await sql/*sql*/`
          SELECT
            v.id,
            v.id AS tournamentid,                             -- back-compat
            v.name, v.city, v.state, v.year, v.maxrundiff,
            v.division, v.sport,
            v.status       AS tournamentstatus,               -- back-compat
            v.visibility   AS tournamentvisibility,           -- back-compat
            v.divisionid, v.sportid, v.statusid, v.visibilityid,
            v.created_at,
            t.advances_per_group,
            t.num_pool_groups
          FROM public.tournaments_api v
          JOIN public.tournaments t ON t.tournamentid = v.id
          WHERE v.id = ${id};
        `) as Row[];
      if (rows.length === 0) return res.status(404).json({ error: "Not found" });
      return res.status(200).json(rows[0]);
    }

    if (req.method === "PATCH") {
      // Read any fields the Overview page may send.
      const {
        name, city, state, year, maxrundiff,
        sportid, statusid, visibilityid, divisionid,
        advances_per_group,
        num_pool_groups,
      } = (req.body ?? {}) as Partial<Row>;

      // Write to the VIEW, not the base table. Triggers do the work.
      // Note: triggers on views can't return rows; do a follow-up SELECT below.
      await sql/*sql*/`
        UPDATE public.tournaments_api
        SET
          name         = COALESCE(${name}, name),
          city         = COALESCE(${city}, city),
          state        = COALESCE(${state}, state),
          year         = COALESCE(${year}, year),
          maxrundiff   = COALESCE(${maxrundiff}, maxrundiff),
          sportid      = COALESCE(${sportid}, sportid),
          statusid     = COALESCE(${statusid}, statusid),
          visibilityid = COALESCE(${visibilityid}, visibilityid),
          divisionid   = COALESCE(${divisionid}, divisionid)
        WHERE id = ${id};
      `;

      // advances_per_group and num_pool_groups live only on the base table (not the view).
      if (advances_per_group !== undefined) {
        await sql/*sql*/`
          UPDATE public.tournaments
          SET advances_per_group = ${advances_per_group ?? null}
          WHERE tournamentid = ${id};
        `;
      }
      if (num_pool_groups !== undefined) {
        await sql/*sql*/`
          UPDATE public.tournaments
          SET num_pool_groups = ${num_pool_groups ?? null}
          WHERE tournamentid = ${id};
        `;
      }

        const rows = (await sql/*sql*/`
          SELECT
            v.id,
            v.id AS tournamentid,
            v.name, v.city, v.state, v.year, v.maxrundiff,
            v.division, v.sport,
            v.status     AS tournamentstatus,
            v.visibility AS tournamentvisibility,
            v.divisionid, v.sportid, v.statusid, v.visibilityid,
            v.created_at,
            t.advances_per_group,
            t.num_pool_groups
          FROM public.tournaments_api v
          JOIN public.tournaments t ON t.tournamentid = v.id
          WHERE v.id = ${id};
        `) as Row[];
      if (rows.length === 0) return res.status(404).json({ error: "Not found after update" });
      return res.status(200).json(rows[0]);
    }

    if (req.method === "DELETE") {
      // Prefer a controlled proc; fallback here if you haven't created it yet.
      // await sql/*sql*/`SELECT public.api_delete_tournament(${id}, 'restrict');`;
      await sql/*sql*/`DELETE FROM public.tournaments WHERE tournamentid = ${id};`;
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET,PATCH,DELETE");
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (err: any) {
    console.error(err);
    // Surface PG error code if present (e.g., FK violation when sending a bad statusid)
    return res.status(500).json({ error: err?.message ?? "Server error", code: err?.code });
  }
}
