import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "@/lib/db";
import { requireSession } from "@/lib/auth/requireSession";
import { ensureTravelTimes, CHANGEOVER_MINUTES } from "@/lib/tournaments/travelTimes";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end("Method Not Allowed");
  }

  const tournamentId = Number(req.query.tournamentid);
  if (!Number.isFinite(tournamentId)) {
    return res.status(400).json({ error: "Invalid tournament id" });
  }

  const session = await requireSession(req, res);
  if (!session) return;

  const client = await pool.connect();
  try {
    const { drivingMinutes, venueLocation } = await ensureTravelTimes(client, tournamentId);
    return res.status(200).json({
      drivingMinutes,
      venueLocation,
      changeoverMinutes: CHANGEOVER_MINUTES,
    });
  } catch (err: any) {
    console.error("[tournaments/[tournamentid]/travel-times] error", err);
    return res.status(500).json({ error: err?.message ?? "Server error" });
  } finally {
    client.release();
  }
}
