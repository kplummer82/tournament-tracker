import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { requireTeamAccess } from "@/lib/auth/requireSession";
import {
  buildPayload,
  isUniqueViolation,
  loadLivePlayerIds,
  loadUserNames,
  parseDefenseInput,
  parseTemplateName,
  rowToTemplate,
  stripUnknown,
  type TemplateRow,
} from "@/lib/lineupTemplates";

function parseId(val: string | string[] | undefined): number | null {
  const raw = Array.isArray(val) ? val[0] : val;
  if (raw == null) return null;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const teamId = parseId(req.query.teamId);
  const templateId = parseId(req.query.templateId);
  if (!teamId) return res.status(400).json({ error: "Invalid teamId" });
  if (!templateId) return res.status(400).json({ error: "Invalid templateId" });

  if (req.method !== "GET" && req.method !== "PUT" && req.method !== "DELETE") {
    res.setHeader("Allow", "GET, PUT, DELETE");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // Same bar on every method — see the note in ./index.ts. Runs before the
  // template lookup so a wrong team can't be probed.
  const session = await requireTeamAccess(req, res, teamId);
  if (!session) return;

  // Confirm the template belongs to this team, so another team's id 404s rather
  // than leaking its contents through a path that already passed the team guard.
  const owner = await sql`
    SELECT id FROM public.team_lineup_templates
    WHERE id = ${templateId} AND teamid = ${teamId} LIMIT 1
  `;
  if (!owner?.length) return res.status(404).json({ error: "Saved lineup not found." });

  /* ── GET ────────────────────────────────────────────────────── */
  if (req.method === "GET") {
    try {
      const rows = (await sql`
        SELECT id, teamid, name, payload, created_by, created_at, updated_by, updated_at
        FROM public.team_lineup_templates
        WHERE id = ${templateId}
      `) as TemplateRow[];
      const live = await loadLivePlayerIds(teamId);
      const names = await loadUserNames(
        [rows[0].created_by, rows[0].updated_by].filter((v): v is string => !!v)
      );
      return res.status(200).json({ template: rowToTemplate(rows[0], live, names) });
    } catch (err) {
      console.error("[lineup-template GET]", err);
      return res.status(500).json({ error: "Server error" });
    }
  }

  /* ── DELETE ─────────────────────────────────────────────────── */
  if (req.method === "DELETE") {
    try {
      await sql`
        DELETE FROM public.team_lineup_templates WHERE id = ${templateId} AND teamid = ${teamId}
      `;
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error("[lineup-template DELETE]", err);
      return res.status(500).json({ error: "Server error" });
    }
  }

  /* ── PUT ────────────────────────────────────────────────────── */
  // Partial by design, so the list view can rename without re-sending the grid.
  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  const hasName = body.name !== undefined;
  const hasDefense = body.defense !== undefined;
  if (!hasName && !hasDefense) return res.status(400).json({ error: "Nothing to update." });

  let name: string | null = null;
  if (hasName) {
    const parsed = parseTemplateName(body.name);
    if ("error" in parsed) return res.status(400).json({ error: parsed.error });
    name = parsed.name;
  }

  let payloadJson: string | null = null;
  let live: Set<number> | null = null;
  if (hasDefense) {
    const parsed = parseDefenseInput(body.defense);
    if ("error" in parsed) return res.status(400).json({ error: parsed.error });
    try {
      live = await loadLivePlayerIds(teamId);
    } catch (err) {
      console.error("[lineup-template PUT roster]", err);
      return res.status(500).json({ error: "Server error" });
    }
    // Stripping here is what makes a save self-heal: ids for players who have
    // since left the roster don't survive the write.
    const { defense } = stripUnknown(parsed.defense, live);
    payloadJson = JSON.stringify(buildPayload(defense));
  }

  try {
    const rows = (await sql`
      UPDATE public.team_lineup_templates
      SET name       = COALESCE(${name}, name),
          payload    = COALESCE(${payloadJson}::jsonb, payload),
          updated_by = ${session.user.id},
          updated_at = NOW()
      WHERE id = ${templateId} AND teamid = ${teamId}
      RETURNING id, teamid, name, payload, created_by, created_at, updated_by, updated_at
    `) as TemplateRow[];

    if (!rows?.length) return res.status(404).json({ error: "Saved lineup not found." });

    const liveIds = live ?? (await loadLivePlayerIds(teamId));
    const names = await loadUserNames(
      [rows[0].created_by, rows[0].updated_by].filter((v): v is string => !!v)
    );
    return res.status(200).json({ template: rowToTemplate(rows[0], liveIds, names) });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(409).json({ error: "A saved lineup with that name already exists." });
    }
    console.error("[lineup-template PUT]", err);
    return res.status(500).json({ error: "Server error" });
  }
}
