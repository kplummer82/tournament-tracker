import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/requireSession";
import { verifyAddress } from "@/lib/usps";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === "GET") {
      const includeFields = req.query.include === "fields";

      const rows = await sql`
        SELECT
          l.id, l.name, l.address, l.city, l.state, l.zip,
          l.latitude, l.longitude, l.usps_verified,
          to_char(l.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
          (SELECT COUNT(*)::int FROM location_fields lf WHERE lf.location_id = l.id) AS field_count
        FROM locations l
        ORDER BY l.name ASC
      `;

      if (includeFields) {
        const fields = await sql`
          SELECT id, location_id, name
          FROM location_fields
          ORDER BY name ASC
        `;
        const fieldsByLoc = new Map<number, { id: number; name: string }[]>();
        for (const f of fields) {
          const arr = fieldsByLoc.get(f.location_id) ?? [];
          arr.push({ id: f.id, name: f.name });
          fieldsByLoc.set(f.location_id, arr);
        }
        const locations = rows.map((r: any) => ({
          ...r,
          fields: fieldsByLoc.get(r.id) ?? [],
        }));
        return res.status(200).json({ locations });
      }

      return res.status(200).json({ locations: rows });
    }

    if (req.method === "POST") {
      const session = await requireAdmin(req, res);
      if (!session) return;

      const { name, address, city, state, zip } = req.body ?? {};
      if (!name?.trim()) {
        return res.status(400).json({ error: "name is required" });
      }

      let finalAddress = address?.trim() || null;
      let finalCity = city?.trim() || null;
      let finalState = state?.trim() || null;
      let finalZip = zip?.trim() || null;
      let uspsVerified = false;

      // Verify address via USPS if address fields are provided
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
        } else {
          console.warn("[locations] USPS verification failed:", result.error, { address: finalAddress, city: finalCity, state: finalState, zip: finalZip });
        }
      } else {
        console.warn("[locations] USPS skipped — missing fields:", { address: finalAddress, city: finalCity, state: finalState, zip: finalZip });
      }

      const inserted = await sql`
        INSERT INTO locations (name, address, city, state, zip, usps_verified)
        VALUES (${name.trim()}, ${finalAddress}, ${finalCity}, ${finalState}, ${finalZip}, ${uspsVerified})
        RETURNING id, name, address, city, state, zip, latitude, longitude, usps_verified,
          to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
      `;

      return res.status(201).json({ ...inserted[0], field_count: 0 });
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).end("Method Not Allowed");
  } catch (err: any) {
    console.error("[locations] error", err);
    return res.status(500).json({ error: err.message ?? "Server error" });
  }
}
