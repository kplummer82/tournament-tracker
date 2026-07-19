import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/requireSession";
import { parseBulkCsv, dedupeKey } from "@/lib/locations/parseBulkCsv";
import { importOne } from "@/lib/locations/importLocations";
import {
  buildSkippedEntries,
  describeDuplicate,
  type CommitResponse,
  type PreviewDuplicate,
  type PreviewInvalid,
  type PreviewReady,
  type PreviewResponse,
} from "@/lib/locations/bulkReport";

// Upper bound on rows per chunked commit. The import modal sends CHUNK_SIZE (5)
// at a time; this is just a guard against a caller asking for an unbounded batch
// and blowing past maxDuration.
const MAX_COMMIT_INDICES = 50;

export const config = {
  api: {
    bodyParser: { sizeLimit: "2mb" },
  },
  // Bounds the worst case: MAX rows per chunk x (GEOCODE_TIMEOUT_MS + insert
  // time). At the modal's chunk size of 5 that's ~5 x 4.3s ~= 22s. Chunk size,
  // the geocode timeout in lib/mapbox/geocodeAddress.ts, and this number are one
  // coupled decision — changing any one means rechecking the other two.
  maxDuration: 30,
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
  //
  // `indices` is optional. Omitted, this imports every ready row and reports
  // every skipped one — the original whole-CSV behaviour, kept so that scripts
  // and any stale client bundle keep working. Supplied, it imports only that
  // subset, which is how the modal drives its progress bar: it walks the ready
  // set in small chunks so no single invocation approaches maxDuration.
  const rawIndices = req.body?.indices;
  let requested: Set<number> | null = null;
  if (rawIndices !== undefined) {
    if (
      !Array.isArray(rawIndices) ||
      rawIndices.length === 0 ||
      rawIndices.length > MAX_COMMIT_INDICES ||
      rawIndices.some((n: unknown) => !Number.isInteger(n) || (n as number) < 0)
    ) {
      return res.status(400).json({
        error: `indices must be a non-empty array of at most ${MAX_COMMIT_INDICES} non-negative integers`,
      });
    }
    requested = new Set<number>(rawIndices as number[]);
  }

  const imported: CommitResponse["imported"] = [];
  const skipped: CommitResponse["skipped"] = [];
  const failed: CommitResponse["failed"] = [];

  if (requested === null) {
    skipped.push(...buildSkippedEntries({ duplicate, invalid }));
  } else {
    // Chunked commit. The client already holds the full skip list from its
    // preview, so repeating it on every chunk would multiply it in the final
    // report. Only report requested rows that are no longer importable.
    //
    // That happens legitimately: rows imported by an earlier chunk are in the
    // DB by now, and a concurrent admin can create a matching location
    // mid-run. Either way the row must be accounted for rather than dropped —
    // the client's progress math depends on the post-condition that every
    // requested index lands in exactly one of imported / skipped / failed.
    const dupByIndex = new Map(duplicate.map((d) => [d.index, d]));
    const invByIndex = new Map(invalid.map((i) => [i.index, i]));
    const readyIndices = new Set(ready.map((r) => r.index));

    for (const idx of requested) {
      if (readyIndices.has(idx)) continue;

      const d = dupByIndex.get(idx);
      if (d) {
        skipped.push({ index: idx, reason: "duplicate", details: describeDuplicate(d) });
        continue;
      }

      const inv = invByIndex.get(idx);
      if (inv) {
        skipped.push({ index: idx, reason: "invalid", details: inv.errors.join("; ") });
        continue;
      }

      // Unreachable with an unchanged CSV. Report it rather than let the row
      // vanish from the totals.
      failed.push({ index: idx, name: `row ${idx + 2}`, error: "Row not found in CSV" });
    }
  }

  // Filter by set membership rather than mapping indices -> rows: `ready` has
  // unique indices, so a repeated index in the request can't import twice.
  const toImport = requested === null ? ready : ready.filter((r) => requested!.has(r.index));

  for (const r of toImport) {
    try {
      const result = await importOne(r.row);
      imported.push({ index: r.index, ...result });
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
