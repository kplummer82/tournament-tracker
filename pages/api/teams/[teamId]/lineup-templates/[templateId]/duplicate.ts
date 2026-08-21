import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { requireTeamAccess } from "@/lib/auth/requireSession";
import {
  countTemplates,
  isUniqueViolation,
  loadLivePlayerIds,
  loadTakenNames,
  loadUserNames,
  nextCopyName,
  parseTemplateName,
  rowToTemplate,
  MAX_TEMPLATES_PER_TEAM,
  type TemplateRow,
} from "@/lib/lineupTemplates";

function parseId(val: string | string[] | undefined): number | null {
  const raw = Array.isArray(val) ? val[0] : val;
  if (raw == null) return null;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Copy a saved lineup. Its own route rather than a client-side GET-then-POST so
 * the server owns the name-collision loop and the cap check — otherwise a
 * copy-of-a-copy turns into a 409 the coach has to resolve by hand.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const teamId = parseId(req.query.teamId);
  const templateId = parseId(req.query.templateId);
  if (!teamId) return res.status(400).json({ error: "Invalid teamId" });
  if (!templateId) return res.status(400).json({ error: "Invalid templateId" });

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const session = await requireTeamAccess(req, res, teamId);
  if (!session) return;

  try {
    const source = (await sql`
      SELECT id, teamid, name, payload, created_by, created_at, updated_by, updated_at
      FROM public.team_lineup_templates
      WHERE id = ${templateId} AND teamid = ${teamId} LIMIT 1
    `) as TemplateRow[];
    if (!source?.length) return res.status(404).json({ error: "Saved lineup not found." });

    if ((await countTemplates(teamId)) >= MAX_TEMPLATES_PER_TEAM) {
      return res
        .status(400)
        .json({ error: `Maximum of ${MAX_TEMPLATES_PER_TEAM} saved lineups per team.` });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    let name: string;
    if (body.name !== undefined) {
      const parsed = parseTemplateName(body.name);
      if ("error" in parsed) return res.status(400).json({ error: parsed.error });
      name = parsed.name;
    } else {
      const derived = nextCopyName(source[0].name, await loadTakenNames(teamId));
      if (!derived) {
        return res.status(409).json({ error: "Too many copies of that lineup. Give the copy a name." });
      }
      name = derived;
    }

    // The payload is copied verbatim; any id that has since gone stale is
    // reported by rowToTemplate as missing and stripped on the copy's next save,
    // exactly as it would be on the original.
    const inserted = (await sql`
      INSERT INTO public.team_lineup_templates (teamid, name, payload, created_by)
      VALUES (${teamId}, ${name}, ${JSON.stringify(source[0].payload ?? {})}::jsonb, ${session.user.id})
      RETURNING id, teamid, name, payload, created_by, created_at, updated_by, updated_at
    `) as TemplateRow[];

    const live = await loadLivePlayerIds(teamId);
    const names = await loadUserNames([session.user.id]);
    return res.status(201).json({ template: rowToTemplate(inserted[0], live, names) });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(409).json({ error: "A saved lineup with that name already exists." });
    }
    console.error("[lineup-template duplicate]", err);
    return res.status(500).json({ error: "Server error" });
  }
}
