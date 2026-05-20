import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/requireSession";
import { verifyAddress } from "@/lib/usps";

const toInt = (v: any, fallback: number) => {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === "GET") {
      const includeFields = req.query.include === "fields";
      const q = (Array.isArray(req.query.q) ? req.query.q[0] : req.query.q ?? "").toString().trim();
      // Paginate only when the caller opts in (passes ?q=, ?page=, or ?pageSize=).
      // Without any of those, return the full list to preserve the legacy
      // behavior existing callers (AdminLocationsClient, LocationPicker) rely on.
      const paginated =
        q.length > 0 || req.query.page != null || req.query.pageSize != null;

      const params: any[] = [];
      let whereSQL = "";
      if (q) {
        params.push(`%${q}%`);
        whereSQL = `WHERE l.name ILIKE $1 OR l.city ILIKE $1 OR l.state ILIKE $1`;
      }

      let total = 0;
      let rows: any[];
      let _page = 1;
      let _pageSize = 0;

      if (paginated) {
        _page = Math.max(1, toInt(req.query.page, 1));
        _pageSize = Math.min(100, Math.max(1, toInt(req.query.pageSize, 25)));
        const offset = (_page - 1) * _pageSize;

        const totalResult = await sql.query(
          `SELECT COUNT(*)::text AS count FROM locations l ${whereSQL}`,
          params
        );
        total = Number(
          Array.isArray(totalResult) ? totalResult[0]?.count ?? 0 : 0
        );

        const pageParams = [...params, _pageSize, offset];
        rows = (await sql.query(
          `
          SELECT
            l.id, l.name, l.address, l.city, l.state, l.zip,
            l.latitude, l.longitude, l.usps_verified,
            to_char(l.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
            (SELECT COUNT(*)::int FROM location_fields lf WHERE lf.location_id = l.id) AS field_count
          FROM locations l
          ${whereSQL}
          ORDER BY l.name ASC
          LIMIT $${pageParams.length - 1} OFFSET $${pageParams.length}
          `,
          pageParams
        )) as any[];
      } else {
        rows = (await sql.query(
          `
          SELECT
            l.id, l.name, l.address, l.city, l.state, l.zip,
            l.latitude, l.longitude, l.usps_verified,
            to_char(l.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
            (SELECT COUNT(*)::int FROM location_fields lf WHERE lf.location_id = l.id) AS field_count
          FROM locations l
          ORDER BY l.name ASC
          `,
          []
        )) as any[];
        total = rows.length;
      }

      const pageRows: any[] = Array.isArray(rows) ? rows : [];

      let resultRows = pageRows;
      if (includeFields && pageRows.length > 0) {
        const ids = pageRows.map((r) => r.id);
        const fields = await sql.query(
          `SELECT id, location_id, name FROM location_fields WHERE location_id = ANY($1::int[]) ORDER BY name ASC`,
          [ids]
        );
        const fieldsByLoc = new Map<number, { id: number; name: string }[]>();
        for (const f of fields as any[]) {
          const arr = fieldsByLoc.get(f.location_id) ?? [];
          arr.push({ id: f.id, name: f.name });
          fieldsByLoc.set(f.location_id, arr);
        }
        resultRows = pageRows.map((r) => ({
          ...r,
          fields: fieldsByLoc.get(r.id) ?? [],
        }));
      }

      return res.status(200).json({
        rows: resultRows,
        // Back-compat: existing callers read `locations`. Keep both keys.
        locations: resultRows,
        total,
        page: _page,
        pageSize: _pageSize,
      });
    }

    if (req.method === "POST") {
      const session = await requireAdmin(req, res);
      if (!session) return;

      const { name, address, city, state, zip, latitude, longitude } = req.body ?? {};
      if (!name?.trim()) {
        return res.status(400).json({ error: "name is required" });
      }

      let finalAddress = address?.trim() || null;
      let finalCity = city?.trim() || null;
      let finalState = state?.trim() || null;
      let finalZip = zip?.trim() || null;
      const finalLat = typeof latitude === "number" ? latitude : (parseFloat(latitude) || null);
      const finalLng = typeof longitude === "number" ? longitude : (parseFloat(longitude) || null);
      let uspsVerified = false;

      // Verify address via USPS if enabled and address fields are provided
      const uspsRows = await sql`SELECT value FROM app_settings WHERE key = 'usps_enabled'`;
      const uspsEnabled = !uspsRows.length || uspsRows[0].value !== "false";

      if (uspsEnabled && finalAddress && finalCity && finalState && finalZip) {
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
      } else if (!uspsEnabled) {
        console.info("[locations] USPS disabled — skipping verification");
      } else {
        console.warn("[locations] USPS skipped — missing fields:", { address: finalAddress, city: finalCity, state: finalState, zip: finalZip });
      }

      const inserted = await sql`
        INSERT INTO locations (name, address, city, state, zip, latitude, longitude, usps_verified)
        VALUES (${name.trim()}, ${finalAddress}, ${finalCity}, ${finalState}, ${finalZip}, ${finalLat}, ${finalLng}, ${uspsVerified})
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
