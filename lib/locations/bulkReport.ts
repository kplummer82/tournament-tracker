// Shared request/response shapes for the bulk location import, plus the
// wording helpers that build the "skipped" report.
//
// No I/O. Safe to call from both the browser (the import modal drives the
// chunked commit and assembles the final report client-side) and the server
// (pages/api/locations/bulk.ts), which is why this lives next to parseBulkCsv.

import type { ParsedRow } from "./parseBulkCsv";

export type PreviewReady = { index: number; row: ParsedRow };

export type PreviewDuplicate = {
  index: number;
  row: ParsedRow;
  matchedBy: "csv" | "db";
  existingId?: number;
  existingName?: string;
};

export type PreviewInvalid = { index: number; row: Partial<ParsedRow>; errors: string[] };

export type PreviewResponse = {
  ready: PreviewReady[];
  duplicate: PreviewDuplicate[];
  invalid: PreviewInvalid[];
  warnings: string[];
};

// "not-attempted" is produced only by the client, when a cancel or a failed
// chunk leaves rows that were never sent. The server never emits it.
export type SkipReason = "duplicate" | "invalid" | "not-attempted";

export type SkippedEntry = { index: number; reason: SkipReason; details: string };

export type CommitResponse = {
  imported: Array<{ index: number; id: number; name: string; field_count: number }>;
  skipped: SkippedEntry[];
  failed: Array<{ index: number; name: string; error: string }>;
};

export function describeDuplicate(d: PreviewDuplicate): string {
  const target =
    d.matchedBy === "db"
      ? `existing location #${d.existingId} (${d.existingName})`
      : `another CSV row (${d.existingName})`;
  return `matches ${target}`;
}

/**
 * Baseline skip list: everything a preview already knows will not be imported.
 * The chunked client builds this once up front, so per-chunk commits only need
 * to report rows that stopped being importable mid-run.
 */
export function buildSkippedEntries(
  p: Pick<PreviewResponse, "duplicate" | "invalid">
): SkippedEntry[] {
  return [
    ...p.invalid.map((i) => ({
      index: i.index,
      reason: "invalid" as const,
      details: i.errors.join("; "),
    })),
    ...p.duplicate.map((d) => ({
      index: d.index,
      reason: "duplicate" as const,
      details: describeDuplicate(d),
    })),
  ];
}
