import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { isValidBracketType } from "@/lib/bracket-types";
import { requireAdmin } from "@/lib/auth/requireSession";

export type BracketTemplateRow = {
  id: number;
  name: string;
  description: string | null;
  structure: Record<string, unknown>;
  is_library: boolean;
  created_at: string | null;
  created_by: number | null;
  bracket_type: string | null;
  seed_count: number | null;
};

function parseId(req: NextApiRequest): number | null {
  const raw = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  if (raw == null) return null;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = parseId(req);
  if (!id) return res.status(400).json({ error: "Invalid id" });

  try {
    if (req.method === "GET") {
      const rows = (await sql`
        SELECT id, name, description, structure, is_library, created_at, created_by, bracket_type, seed_count
        FROM public.bracket_templates
        WHERE id = ${id}
      `) as BracketTemplateRow[];
      if (rows.length === 0) return res.status(404).json({ error: "Not found" });
      return res.status(200).json(rows[0]);
    }

    if (req.method === "PATCH") {
      const existing = (await sql`
        SELECT id, name, description, structure, is_library, created_at, created_by, bracket_type, seed_count
        FROM public.bracket_templates WHERE id = ${id}
      `) as BracketTemplateRow[];
      if (existing.length === 0) return res.status(404).json({ error: "Not found" });
      const row = existing[0];
      if (row.created_by === null) {
        const session = await requireAdmin(req, res);
        if (!session) return;
      }
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {};
      const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : row.name;
      const description =
        body.description !== undefined
          ? (typeof body.description === "string" ? body.description.trim() || null : null)
          : row.description;
      const structure =
        body.structure != null && typeof body.structure === "object" ? body.structure : row.structure;
      const isLibrary =
        typeof body.is_library === "boolean" ? body.is_library : row.is_library;
      // Bracket type is derived from structure (ignoring body.bracket_type)
      const struct = structure != null && typeof structure === "object" ? structure : row.structure;
      const structType =
        struct != null &&
        (typeof (struct as { bracketType?: string }).bracketType === "string" ||
          typeof (struct as { bracket_type?: string }).bracket_type === "string")
          ? ((struct as { bracketType?: string }).bracketType ??
             (struct as { bracket_type?: string }).bracket_type) as string
          : null;
      const bracketType = structType != null && isValidBracketType(structType) ? structType : row.bracket_type;
      // Seed count is always derived from structure (from body if updated, else existing)
      const structureForSeed = structure != null && typeof structure === "object" ? structure : row.structure;
      let seedCount: number | null = null;
      if (structureForSeed != null && typeof (structureForSeed as { numTeams?: number }).numTeams === "number") {
        const n = (structureForSeed as { numTeams: number }).numTeams;
        if (Number.isFinite(n) && n > 0) seedCount = n;
      }
      if (seedCount == null) seedCount = row.seed_count;
      await sql`
        UPDATE public.bracket_templates
        SET name = ${name}, description = ${description}, structure = ${JSON.stringify(structure)}::jsonb, is_library = ${isLibrary}, bracket_type = ${bracketType}, seed_count = ${seedCount}
        WHERE id = ${id}
      `;
      const rows = (await sql`
        SELECT id, name, description, structure, is_library, created_at, created_by, bracket_type, seed_count
        FROM public.bracket_templates WHERE id = ${id}
      `) as BracketTemplateRow[];
      return res.status(200).json(rows[0]);
    }

    if (req.method === "DELETE") {
      const existing = (await sql`
        SELECT id, created_by FROM public.bracket_templates WHERE id = ${id}
      `) as { id: number; created_by: number | null }[];
      if (existing.length === 0) return res.status(404).json({ error: "Not found" });
      if (existing[0].created_by === null) {
        const session = await requireAdmin(req, res);
        if (!session) return;
      }
      const result = await sql`DELETE FROM public.bracket_templates WHERE id = ${id} RETURNING id`;
      if (result.length === 0) return res.status(404).json({ error: "Not found" });
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, PATCH, DELETE");
    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("[bracket-templates/[id] API]", err);
    return res.status(500).json({ error: message });
  }
}
