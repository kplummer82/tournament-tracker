import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";

const VIEW_NAME = "public.tournamentteams_view"; // your view

type Row = { name: string; season: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // Accept string or array, don't coerce to Number (let Postgres cast)
  const idParamRaw = req.query.tournamentid;
  const idParam = Array.isArray(idParamRaw) ? idParamRaw[0] : idParamRaw;
  if (!idParam) return res.status(400).json({ error: "Invalid tournament id" });

  try {
    let resp: any;

    // Case 1: pg-style client -> sql.query(text, params)
    if (typeof (sql as any).query === "function") {
      const QUERY = `
        SELECT name, season
        FROM ${VIEW_NAME}
        WHERE tournamentid = $1
        ORDER BY name
      `;
      resp = await (sql as any).query(QUERY, [idParam]); // pass string OK
    }
    // Case 2: Neon tagged template -> sql`...`
    else if (typeof (sql as any) === "function") {
      resp = await (sql as any)`
        SELECT name, season
        FROM ${sql.unsafe?.(VIEW_NAME) ?? VIEW_NAME}  -- keep literal identifier
        WHERE tournamentid = ${idParam}
        ORDER BY name
      `;
    } else {
      throw new Error("Unsupported DB client: expected sql.query(...) or sql`...`");
    }

    // Normalize to rows[]
    const rows: Row[] = Array.isArray(resp) ? (resp as Row[]) : (resp?.rows as Row[]) ?? [];

    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=120");
    return res.status(200).json(rows);
  } catch (err: any) {
    console.error("teamsview error:", err);
    return res.status(500).json({ error: err?.message ?? "Query failed" });
  }
}
