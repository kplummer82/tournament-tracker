import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/requireSession";

function parseLocationId(req: NextApiRequest): number | null {
  const raw = Array.isArray(req.query.locationId) ? req.query.locationId[0] : req.query.locationId;
  const n = parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) ? n : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const locationId = parseLocationId(req);
  if (!locationId) return res.status(400).json({ error: "Invalid location id" });

  try {
    if (req.method === "GET") {
      const rows = await sql`
        SELECT id, name,
          to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
        FROM location_fields
        WHERE location_id = ${locationId}
        ORDER BY name ASC
      `;
      return res.status(200).json({ fields: rows });
    }

    if (req.method === "POST") {
      const session = await requireAdmin(req, res);
      if (!session) return;

      const { name } = req.body ?? {};
      if (!name?.trim()) {
        return res.status(400).json({ error: "name is required" });
      }

      const inserted = await sql`
        INSERT INTO location_fields (location_id, name)
        VALUES (${locationId}, ${name.trim()})
        RETURNING id, name,
          to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
      `;
      return res.status(201).json(inserted[0]);
    }

    if (req.method === "DELETE") {
      const session = await requireAdmin(req, res);
      if (!session) return;

      const fieldIdRaw = Array.isArray(req.query.fieldId) ? req.query.fieldId[0] : req.query.fieldId;
      const fieldId = parseInt(String(fieldIdRaw ?? ""), 10);
      if (!Number.isFinite(fieldId)) {
        return res.status(400).json({ error: "fieldId query param is required" });
      }

      const rows = await sql`
        DELETE FROM location_fields
        WHERE id = ${fieldId} AND location_id = ${locationId}
        RETURNING id
      `;
      if (!rows.length) return res.status(404).json({ error: "Not found" });
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", ["GET", "POST", "DELETE"]);
    return res.status(405).end("Method Not Allowed");
  } catch (err: any) {
    console.error("[locations/[locationId]/fields] error", err);
    if (err.code === "23505") {
      return res.status(409).json({ error: "A field with this name already exists at this location" });
    }
    if (err.code === "23503") {
      return res.status(404).json({ error: "Location not found" });
    }
    return res.status(500).json({ error: err.message ?? "Server error" });
  }
}
