import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "@/lib/db";

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  try {
    const client = await pool.connect();
    try {
      const r = await client.query(`SELECT id, gamestatus AS name FROM gamestatusoptions ORDER BY id`);
      return res.status(200).json({ statuses: r.rows });
    } finally {
      client.release();
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to load game statuses" });
  }
}
