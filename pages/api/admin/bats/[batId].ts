import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/requireSession";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const batId = parseInt(req.query.batId as string, 10);
  if (isNaN(batId)) return res.status(400).json({ error: "Invalid bat id" });

  try {
    const session = await requireAdmin(req, res);
    if (!session) return;

    if (req.method === "PATCH") {
      const { name, sport_id } = req.body ?? {};

      let trimmedName: string | null = null;
      if (name !== undefined) {
        if (typeof name !== "string" || !name.trim()) {
          return res.status(400).json({ error: "name cannot be empty" });
        }
        trimmedName = name.trim();
      }

      let sportId: number | null = null;
      if (sport_id !== undefined) {
        const n = parseInt(String(sport_id), 10);
        if (isNaN(n)) return res.status(400).json({ error: "Invalid sport_id" });
        sportId = n;
      }

      const updated = await sql`
        WITH upd AS (
          UPDATE bats SET
            name     = COALESCE(${trimmedName}, name),
            sport_id = COALESCE(${sportId}::int, sport_id)
          WHERE id = ${batId}
          RETURNING id, name, sport_id
        )
        SELECT upd.id, upd.name, upd.sport_id, sp.sportname AS sport_name
        FROM upd
        JOIN sport sp ON sp.id = upd.sport_id
      `;
      if (updated.length === 0) return res.status(404).json({ error: "Bat not found" });
      return res.status(200).json(updated[0]);
    }

    if (req.method === "DELETE") {
      const deleted = await sql`
        DELETE FROM bats WHERE id = ${batId} RETURNING id
      `;
      if (deleted.length === 0) return res.status(404).json({ error: "Bat not found" });
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", ["PATCH", "DELETE"]);
    return res.status(405).end("Method Not Allowed");
  } catch (err: any) {
    if (err?.code === "23503") {
      return res
        .status(409)
        .json({ error: "Bat is in use; remove or change references first." });
    }
    if (err?.code === "23505") {
      return res.status(409).json({ error: "A bat with that name already exists for that sport" });
    }
    console.error("[admin/bats] error", err);
    return res.status(500).json({ error: "Server error" });
  }
}
