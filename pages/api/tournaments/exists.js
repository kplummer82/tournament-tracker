import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  const { name = "", division = "", year = "", state = "", city = "" } = req.query;

  if (!name || !division || !year || !state) {
    return res.status(200).json({ exists: false });
  }

  try {
    const rows = await sql`
      SELECT tournamentid
      FROM public.tournaments
      WHERE lower(name) = lower(${name})
        AND lower(division) = lower(${division})
        AND year = ${Number(year)}
        AND upper(state) = upper(${state})
        AND lower(coalesce(city, '')) = lower(${city})
      LIMIT 1;
    `;

    if (rows?.length) {
      const id = rows[0].tournamentid;
      return res.status(200).json({ exists: true, id, href: `/tournaments/${id}` });
    }
    return res.status(200).json({ exists: false });
  } catch (e) {
    console.error("exists endpoint error:", e);
    return res.status(500).json({ exists: false, error: "Lookup failed." });
  }
}