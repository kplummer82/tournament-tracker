import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/requireSession";
import { verifyAddress } from "@/lib/usps";

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
        SELECT
          l.id, l.name, l.address, l.city, l.state, l.zip,
          l.latitude, l.longitude, l.usps_verified,
          to_char(l.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
        FROM locations l
        WHERE l.id = ${locationId}
      `;
      if (!rows.length) return res.status(404).json({ error: "Not found" });

      const fields = await sql`
        SELECT id, name,
          to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
        FROM location_fields
        WHERE location_id = ${locationId}
        ORDER BY name ASC
      `;

      return res.status(200).json({ ...rows[0], fields });
    }

    if (req.method === "PATCH") {
      const session = await requireAdmin(req, res);
      if (!session) return;

      const { name, address, city, state, zip } = req.body ?? {};

      let finalAddress = address?.trim() ?? null;
      let finalCity = city?.trim() ?? null;
      let finalState = state?.trim() ?? null;
      let finalZip = zip?.trim() ?? null;
      let uspsVerified = false;

      // Re-verify via USPS if address fields are provided
      if (finalAddress && finalCity && finalState && finalZip) {
        const result = await verifyAddress({
          address: finalAddress,
          city: finalCity,
          state: finalState,
          zip: finalZip,
        });
        if (result.verified) {
          finalAddress = result.address;
          finalCity = result.city;
          finalState = result.state;
          finalZip = result.zip;
          uspsVerified = true;
        }
      }

      const rows = await sql`
        UPDATE locations
        SET
          name    = COALESCE(${name?.trim() ?? null}, name),
          address = COALESCE(${finalAddress}, address),
          city    = COALESCE(${finalCity}, city),
          state   = COALESCE(${finalState}, state),
          zip     = COALESCE(${finalZip}, zip),
          usps_verified = ${uspsVerified}
        WHERE id = ${locationId}
        RETURNING id, name, address, city, state, zip, latitude, longitude, usps_verified,
          to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
      `;
      if (!rows.length) return res.status(404).json({ error: "Not found" });
      return res.status(200).json(rows[0]);
    }

    if (req.method === "DELETE") {
      const session = await requireAdmin(req, res);
      if (!session) return;

      const rows = await sql`
        DELETE FROM locations WHERE id = ${locationId} RETURNING id
      `;
      if (!rows.length) return res.status(404).json({ error: "Not found" });
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", ["GET", "PATCH", "DELETE"]);
    return res.status(405).end("Method Not Allowed");
  } catch (err: any) {
    console.error("[locations/[locationId]] error", err);
    return res.status(500).json({ error: err.message ?? "Server error" });
  }
}
