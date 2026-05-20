import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/requireSession";

// CSV escape: wrap a value in double quotes if it contains a comma, double quote,
// semicolon, or newline; double any internal quotes. Returns "" for null/empty.
function csvCell(v: string | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  if (s === "") return "";
  if (/[",\r\n;]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function todayIsoDate(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end("Method Not Allowed");
  }

  const session = await requireAdmin(req, res);
  if (!session) return;

  try {
    const rows = await sql`
      SELECT
        l.name,
        l.address,
        l.city,
        l.state,
        l.zip,
        COALESCE(
          (SELECT string_agg(lf.name, ';' ORDER BY lf.name)
           FROM location_fields lf
           WHERE lf.location_id = l.id),
          ''
        ) AS fields
      FROM locations l
      ORDER BY l.name ASC
    `;

    const lines: string[] = ["name,address,city,state,zip,fields"];
    for (const r of rows as Array<{
      name: string;
      address: string | null;
      city: string | null;
      state: string | null;
      zip: string | null;
      fields: string;
    }>) {
      lines.push(
        [
          csvCell(r.name),
          csvCell(r.address),
          csvCell(r.city),
          csvCell(r.state),
          csvCell(r.zip),
          csvCell(r.fields),
        ].join(",")
      );
    }
    const body = lines.join("\r\n") + "\r\n";

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="locations-${todayIsoDate()}.csv"`
    );
    res.status(200).send(body);
  } catch (err: any) {
    console.error("[locations/export] error", err);
    res.status(500).json({ error: err?.message ?? "Server error" });
  }
}
