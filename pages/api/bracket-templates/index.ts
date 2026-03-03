import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { isValidBracketType } from "@/lib/bracket-types";
import { getSessionForRequest } from "@/lib/auth/server";

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

function getQueryParam(req: NextApiRequest, key: string): string | null {
  const v = req.query[key];
  if (v == null) return null;
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === "string" && s.trim() ? s.trim() : null;
}

function getQueryParamInt(req: NextApiRequest, key: string): number | null {
  const s = getQueryParam(req, key);
  if (s == null) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === "GET") {
      const library = req.query.library === "1" || req.query.library === "true";
      const bracketType = getQueryParam(req, "bracket_type");
      const seedCount = getQueryParamInt(req, "seed_count");
      const seedMin = getQueryParamInt(req, "seed_min");
      const seedMax = getQueryParamInt(req, "seed_max");
      const search = getQueryParam(req, "q") ?? getQueryParam(req, "search");

      if (bracketType != null && !isValidBracketType(bracketType)) {
        return res.status(400).json({ error: "Invalid bracket_type." });
      }

      const searchPattern = search != null ? `%${search}%` : null;

      // Use COALESCE so PostgreSQL can infer param types (avoids "could not determine data type of parameter $n" when nulls are passed)
      const requireLibrary = library;
      const rows = (await sql`
        SELECT id, name, description, structure, is_library, created_at, created_by, bracket_type, seed_count
        FROM public.bracket_templates
        WHERE
          (${!requireLibrary} OR (is_library = true AND created_by IS NULL))
          AND bracket_type = COALESCE((${bracketType})::text, bracket_type)
          AND seed_count = COALESCE((${seedCount})::integer, seed_count)
          AND seed_count >= COALESCE((${seedMin})::integer, 0)
          AND seed_count <= COALESCE((${seedMax})::integer, 2147483647)
          AND (CAST(${searchPattern} AS text) IS NULL OR (name ILIKE ${searchPattern} OR description ILIKE ${searchPattern}))
        ORDER BY name ASC
      `) as BracketTemplateRow[];

      return res.status(200).json(rows);
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {};
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const description =
        typeof body.description === "string" ? body.description.trim() || null : null;
      const structure = body.structure != null && typeof body.structure === "object" ? body.structure : null;
      const isLibrary = body.is_library === true || body.isLibrary === true;
      // Bracket type is derived from the structure (ignoring body.bracket_type)
      const structType =
        structure != null &&
        (typeof (structure as { bracketType?: string }).bracketType === "string" ||
          typeof (structure as { bracket_type?: string }).bracket_type === "string")
          ? ((structure as { bracketType?: string }).bracketType ??
             (structure as { bracket_type?: string }).bracket_type) as string
          : null;
      const bracketType = structType != null && isValidBracketType(structType) ? structType : null;
      // Seed count is always derived from the bracket structure
      let seedCount: number | null = null;
      if (structure != null && typeof (structure as { numTeams?: number }).numTeams === "number") {
        const n = (structure as { numTeams: number }).numTeams;
        if (Number.isFinite(n) && n > 0) seedCount = n;
      }

      if (!name) return res.status(400).json({ error: "Name is required." });
      if (!structure) return res.status(400).json({ error: "Structure is required." });

      // System templates (is_library true, created_by null) may only be created by admins
      if (isLibrary) {
        const session = await getSessionForRequest(req);
        if (!session?.user) return res.status(401).json({ error: "Unauthorized" });
        if (session.user.role !== "admin") return res.status(403).json({ error: "Only admins can create system brackets." });
      }

      const inserted = (await sql`
        INSERT INTO public.bracket_templates (name, description, structure, is_library, created_by, bracket_type, seed_count)
        VALUES (${name}, ${description}, ${JSON.stringify(structure)}::jsonb, ${isLibrary}, NULL, ${bracketType}, ${seedCount})
        RETURNING id, name, description, structure, is_library, created_at, created_by, bracket_type, seed_count
      `) as BracketTemplateRow[];

      return res.status(201).json(inserted[0]);
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("[bracket-templates API]", err);
    return res.status(500).json({ error: message });
  }
}
