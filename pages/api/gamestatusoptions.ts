// pages/api/gamestatusoptions.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "@/lib/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `
        SELECT 
          id,
          gamestatus,
          gamestatusdescription
        FROM gamestatusoptions
        ORDER BY id;
        `
      );

      const statuses = result.rows.map((row) => ({
        id: row.id,
        gamestatus: row.gamestatus,
        gamestatusdescription: row.gamestatusdescription,
      }));

      res.status(200).json({ statuses });
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error("Error loading game status options:", err);
    res.status(500).json({ error: "Failed to load game status options" });
  }
}
