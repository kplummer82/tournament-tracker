import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { requireTeamAccess } from "@/lib/auth/requireSession";
import {
  buildPayload,
  countTemplates,
  isUniqueViolation,
  loadLivePlayerIds,
  loadUserNames,
  parseDefenseInput,
  parseTemplateName,
  rowToTemplate,
  stripUnknown,
  MAX_TEMPLATES_PER_TEAM,
  type LineupTemplate,
  type TemplateRow,
} from "@/lib/lineupTemplates";

export type LineupTemplateListResponse = { templates: LineupTemplate[] };

function parseId(val: string | string[] | undefined): number | null {
  const raw = Array.isArray(val) ? val[0] : val;
  if (raw == null) return null;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const teamId = parseId(req.query.teamId);
  if (!teamId) return res.status(400).json({ error: "Invalid teamId" });

  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // Saved lineups are coaching data — staff only, on read as well as write.
  // Deliberately the same bar for both: unlike per-author position ratings there
  // is no personal set to protect, and the import target
  // (PUT /api/games/[source]/[gameId]/defensive-lineup) also uses
  // requireTeamAccess. A stricter guard here would let a league admin write a
  // game's defense but not create the lineup feeding it.
  const session = await requireTeamAccess(req, res, teamId);
  if (!session) return;

  /* ── GET ────────────────────────────────────────────────────── */
  if (req.method === "GET") {
    try {
      const rows = (await sql`
        SELECT id, teamid, name, payload, created_by, created_at, updated_by, updated_at
        FROM public.team_lineup_templates
        WHERE teamid = ${teamId}
        ORDER BY lower(btrim(name)) ASC
      `) as TemplateRow[];

      const live = await loadLivePlayerIds(teamId);
      const names = await loadUserNames(
        rows.flatMap((r) => [r.created_by, r.updated_by].filter((v): v is string => !!v))
      );
      const payload: LineupTemplateListResponse = {
        templates: rows.map((r) => rowToTemplate(r, live, names)),
      };
      return res.status(200).json(payload);
    } catch (err) {
      console.error("[lineup-templates GET]", err);
      return res.status(500).json({ error: "Server error" });
    }
  }

  /* ── POST ───────────────────────────────────────────────────── */
  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};

  const parsedName = parseTemplateName(body.name);
  if ("error" in parsedName) return res.status(400).json({ error: parsedName.error });

  const parsedDefense = parseDefenseInput(body.defense);
  if ("error" in parsedDefense) return res.status(400).json({ error: parsedDefense.error });

  try {
    // Read-then-insert, so two simultaneous creates could both pass at the cap.
    // Same accepted race as MAX_BRACKETS; the cap is a guardrail, not an invariant.
    if ((await countTemplates(teamId)) >= MAX_TEMPLATES_PER_TEAM) {
      return res
        .status(400)
        .json({ error: `Maximum of ${MAX_TEMPLATES_PER_TEAM} saved lineups per team.` });
    }

    const live = await loadLivePlayerIds(teamId);
    const { defense } = stripUnknown(parsedDefense.defense, live);

    // Single statement, so the stateless Neon HTTP `sql` tag is fine here —
    // no pool.connect()/BEGIN needed.
    const inserted = (await sql`
      INSERT INTO public.team_lineup_templates (teamid, name, payload, created_by)
      VALUES (${teamId}, ${parsedName.name}, ${JSON.stringify(buildPayload(defense))}::jsonb, ${session.user.id})
      RETURNING id, teamid, name, payload, created_by, created_at, updated_by, updated_at
    `) as TemplateRow[];

    const names = await loadUserNames([session.user.id]);
    return res.status(201).json({ template: rowToTemplate(inserted[0], live, names) });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(409).json({ error: "A saved lineup with that name already exists." });
    }
    console.error("[lineup-templates POST]", err);
    return res.status(500).json({ error: "Server error" });
  }
}
