import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { requireTournamentAccess } from "@/lib/auth/requireSession";

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
  forfeit_run_diff: number | null;
  advances_per_group: number | null;
  num_pool_groups: number | null;
  pool_play_games_per_team: number | null;
  has_pool_play: boolean | null;

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
  bats: { id: number; name: string }[];
  schedule_config: unknown | null;

  created_at: string | null;
};

async function fetchRow(id: number): Promise<Row | null> {
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
      t.forfeit_run_diff,
      t.advances_per_group,
      t.num_pool_groups,
      t.pool_play_games_per_team,
      t.has_pool_play,
      t.schedule_config,
      COALESCE((
        SELECT json_agg(json_build_object('id', b.id, 'name', b.name) ORDER BY b.id)
        FROM public.tournament_bats tb
        JOIN public.bats b ON b.id = tb.bat_id
        WHERE tb.tournament_id = v.id
      ), '[]'::json) AS bats
    FROM public.tournaments_api v
    JOIN public.tournaments t ON t.tournamentid = v.id
    WHERE v.id = ${id};
  `) as Row[];
  return rows[0] ?? null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { tournamentid } = req.query;
  const id = Number(tournamentid);
  if (!id || Number.isNaN(id)) return res.status(400).json({ error: "Invalid tournamentid" });

  try {
    if (req.method === "GET") {
      const row = await fetchRow(id);
      if (!row) return res.status(404).json({ error: "Not found" });
      return res.status(200).json(row);
    }

    if (req.method === "PATCH") {
      const session = await requireTournamentAccess(req, res, id);
      if (!session) return;

      // Read any fields the Overview page may send.
      const {
        name, city, state, year, maxrundiff,
        sportid, statusid, visibilityid, divisionid,
        forfeit_run_diff,
        advances_per_group,
        num_pool_groups,
        pool_play_games_per_team,
        has_pool_play,
        schedule_config,
        bat_ids,
      } = (req.body ?? {}) as Partial<Row> & { bat_ids?: unknown };

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
      if (forfeit_run_diff !== undefined) {
        await sql/*sql*/`
          UPDATE public.tournaments
          SET forfeit_run_diff = ${forfeit_run_diff ?? null}
          WHERE tournamentid = ${id};
        `;
      }
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
      if (pool_play_games_per_team !== undefined) {
        await sql/*sql*/`
          UPDATE public.tournaments
          SET pool_play_games_per_team = ${pool_play_games_per_team ?? null}
          WHERE tournamentid = ${id};
        `;
      }
      if (has_pool_play !== undefined) {
        await sql/*sql*/`
          UPDATE public.tournaments
          SET has_pool_play = ${Boolean(has_pool_play)}
          WHERE tournamentid = ${id};
        `;
      }
      if (schedule_config !== undefined) {
        await sql/*sql*/`
          UPDATE public.tournaments
          SET schedule_config = ${
            schedule_config === null ? null : JSON.stringify(schedule_config)
          }::jsonb
          WHERE tournamentid = ${id};
        `;
      }

      if (bat_ids !== undefined) {
        if (!Array.isArray(bat_ids)) {
          return res.status(400).json({ error: "bat_ids must be an array" });
        }
        const normalized = (bat_ids as unknown[])
          .map((b) => parseInt(String(b), 10))
          .filter((n) => Number.isFinite(n));
        await sql/*sql*/`DELETE FROM public.tournament_bats WHERE tournament_id = ${id};`;
        if (normalized.length > 0) {
          await sql/*sql*/`
            INSERT INTO public.tournament_bats (tournament_id, bat_id)
            SELECT ${id}, b.id FROM public.bats b WHERE b.id = ANY(${normalized}::int[])
          `;
        }
      }

      const row = await fetchRow(id);
      if (!row) return res.status(404).json({ error: "Not found after update" });
      return res.status(200).json(row);
    }

    if (req.method === "DELETE") {
      const session = await requireTournamentAccess(req, res, id);
      if (!session) return;

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
