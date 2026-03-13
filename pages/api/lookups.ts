// pages/api/lookups.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "@/lib/db";

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  try {
    const client = await pool.connect();
    //const [sports, statuses, vis] = await Promise.all([
    const [sports, statuses, vis, divisions] = await Promise.all([
      client.query(`SELECT id, sportname AS name FROM public.sport ORDER BY name`),
      client.query(`SELECT id, tournamentstatus AS name FROM public.tournamentstatus ORDER BY name`),
      client.query(`SELECT id, tournamentvisibility AS name FROM public.tournamentvisibility ORDER BY name`),
      client.query(`SELECT id, division AS name FROM public.divisions ORDER BY sorting_key`),
    ]);
    client.release();

    res.status(200).json({
      sports: sports.rows,          // [{id, name}]
      statuses: statuses.rows,      // [{id, name}]
      visibilities: vis.rows,       // [{id, name}]
      divisions: divisions.rows,    // [{id, name}]
    });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message || "Failed to load lookups" });
  }
}
