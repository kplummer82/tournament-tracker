import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/requireSession";
import { parseBulkCsv, dedupeKey, type ParsedRow } from "@/lib/locations/parseBulkCsv";
import { importOne } from "@/lib/locations/importLocations";

type PreviewReady = { index: number; row: ParsedRow };
type PreviewDuplicate = {
  index: number;
  row: ParsedRow;
  matchedBy: "csv" | "db";
  existingId?: number;
  existingName?: string;
};
type PreviewInvalid = { index: number; row: Partial<ParsedRow>; errors: string[] };

type PreviewResponse = {
  ready: PreviewReady[];
  duplicate: PreviewDuplicate[];
  invalid: PreviewInvalid[];
  warnings: string[];
};

type CommitResponse = {
  imported: Array<{ id: number; name: string; field_count: number }>;
  skipped: Array<{ index: number; reason: "duplicate" | "invalid"; details: string }>;
  failed: Array<{ index: number; name: string; error: string }>;
};

export const config = {
  api: {
    bodyParser: { sizeLimit: "2mb" },
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end("Method Not Allowed");
  }

  const session = await requireAdmin(req, res);
  if (!session) return;

  const mode = req.query.mode === "commit" ? "commit" : "preview";
  const csv = typeof req.body?.csv === "string" ? req.body.csv : null;
  if (!csv) {
    return res.status(400).json({ error: "Request body must include { csv: string }" });
  }

  const parsed = parseBulkCsv(csv);
  if (parsed.ok === false) {
    return res.status(400).json({ error: parsed.error });
  }

  // Build dedupe state: existing DB rows + within-CSV collisions.
  const existing = await sql`SELECT id, name, city, state FROM locations`;
  const existingByKey = new Map<string, { id: number; name: string }>();
  for (const e of existing as Array<{ id: number; name: string; city: string | null; state: string | null }>) {
    existingByKey.set(dedupeKey(e.name, e.city, e.state), { id: e.id, name: e.name });
  }

  const seenInCsv = new Map<string, number>(); // key → first occurrence index
  const ready: PreviewReady[] = [];
  const duplicate: PreviewDuplicate[] = [];

  for (const v of parsed.valid) {
    const key = dedupeKey(v.row.name, v.row.city, v.row.state);

    const dbHit = existingByKey.get(key);
    if (dbHit) {
      duplicate.push({
        index: v.index,
        row: v.row,
        matchedBy: "db",
        existingId: dbHit.id,
        existingName: dbHit.name,
      });
      continue;
    }

    const csvHitIndex = seenInCsv.get(key);
    if (csvHitIndex !== undefined) {
      duplicate.push({
        index: v.index,
        row: v.row,
        matchedBy: "csv",
        existingName: parsed.valid.find((p) => p.index === csvHitIndex)?.row.name,
      });
      continue;
    }

    seenInCsv.set(key, v.index);
    ready.push({ index: v.index, row: v.row });
  }

  const invalid: PreviewInvalid[] = parsed.invalid.map((i) => ({
    index: i.index,
    row: {},
    errors: i.errors,
  }));

  if (mode === "preview") {
    const response: PreviewResponse = {
      ready,
      duplicate,
      invalid,
      warnings: parsed.warnings,
    };
    return res.status(200).json(response);
  }

  // commit
  const imported: CommitResponse["imported"] = [];
  const skipped: CommitResponse["skipped"] = [];
  const failed: CommitResponse["failed"] = [];

  for (const inv of invalid) {
    skipped.push({ index: inv.index, reason: "invalid", details: inv.errors.join("; ") });
  }
  for (const d of duplicate) {
    const target =
      d.matchedBy === "db"
        ? `existing location #${d.existingId} (${d.existingName})`
        : `another CSV row (${d.existingName})`;
    skipped.push({ index: d.index, reason: "duplicate", details: `matches ${target}` });
  }

  for (const r of ready) {
    try {
      const result = await importOne(r.row);
      imported.push(result);
    } catch (err: any) {
      console.error("[locations/bulk] importOne failed", { index: r.index, name: r.row.name, err });
      failed.push({
        index: r.index,
        name: r.row.name,
        error: err?.message ?? "Unknown error",
      });
    }
  }

  const response: CommitResponse = { imported, skipped, failed };
  return res.status(200).json(response);
}
