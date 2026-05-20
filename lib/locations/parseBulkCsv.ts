// Pure CSV parser + validator for the bulk location import feature.
// No I/O. Safe to call from both the browser (preview) and server (defense).
//
// Expected header (case-insensitive, must include all six in any order):
//   name, address, city, state, zip, fields
// `fields` is semicolon-separated. Quoted CSV values are supported.

export type RawCell = string;

export type ParsedRow = {
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  fields: string[];
};

export type RowError = {
  index: number; // 0-based data-row index (header excluded)
  errors: string[];
};

export type ParseResult =
  | {
      ok: true;
      valid: Array<{ index: number; row: ParsedRow }>;
      invalid: RowError[];
      warnings: string[];
    }
  | {
      ok: false;
      error: string;
    };

const REQUIRED_COLUMNS = ["name", "address", "city", "state", "zip", "fields"] as const;
type Column = (typeof REQUIRED_COLUMNS)[number];

// Tokenize a single CSV line respecting double-quoted fields with "" escapes.
function splitCsvLine(line: string): RawCell[] {
  const out: RawCell[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur);
  return out;
}

// Split full text into logical CSV rows. Handles quoted newlines.
function splitCsvRows(text: string): string[] {
  const rows: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      // Track quoted state so newlines inside quotes are preserved.
      if (inQuotes && text[i + 1] === '"') {
        cur += '""';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      cur += ch;
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      if (cur.length > 0) rows.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.length > 0) rows.push(cur);
  return rows;
}

export function parseBulkCsv(text: string): ParseResult {
  const rawRows = splitCsvRows(text.replace(/^﻿/, "")); // strip BOM
  if (rawRows.length === 0) {
    return { ok: false, error: "CSV is empty" };
  }

  const headerCells = splitCsvLine(rawRows[0]).map((c) => c.trim().toLowerCase());
  const colIndex: Partial<Record<Column, number>> = {};
  for (const col of REQUIRED_COLUMNS) {
    const idx = headerCells.indexOf(col);
    if (idx === -1) {
      return { ok: false, error: `CSV missing required column: ${col}` };
    }
    colIndex[col] = idx;
  }

  const warnings: string[] = [];
  const extraCols = headerCells.filter(
    (h, i) => !REQUIRED_COLUMNS.includes(h as Column) && headerCells.indexOf(h) === i
  );
  if (extraCols.length > 0) {
    warnings.push(`Extra columns ignored: ${extraCols.join(", ")}`);
  }

  if (rawRows.length < 2) {
    return { ok: false, error: "CSV contains no data rows" };
  }

  const valid: Array<{ index: number; row: ParsedRow }> = [];
  const invalid: RowError[] = [];

  for (let r = 1; r < rawRows.length; r++) {
    const dataIndex = r - 1;
    const cells = splitCsvLine(rawRows[r]);

    // Tolerate fully-empty trailing rows (common from spreadsheet exports).
    if (cells.every((c) => c.trim() === "")) continue;

    const get = (col: Column) => (cells[colIndex[col]!] ?? "").trim();

    const name = get("name");
    const address = get("address");
    const city = get("city");
    const stateRaw = get("state");
    const zip = get("zip");
    const fieldsRaw = get("fields");

    const errors: string[] = [];

    if (!name) errors.push("name is required");

    const state = stateRaw.toUpperCase();
    if (!state) {
      errors.push("state is required");
    } else if (!/^[A-Z]{2}$/.test(state)) {
      errors.push(`state must be a 2-letter code (got "${stateRaw}")`);
    }

    if (zip && !/^\d{5}$/.test(zip)) {
      errors.push(`zip must be 5 digits (got "${zip}")`);
    }

    const fieldNames = fieldsRaw
      .split(";")
      .map((f) => f.trim())
      .filter((f) => f.length > 0);

    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const f of fieldNames) {
      const key = f.toLowerCase();
      if (seen.has(key)) dupes.push(f);
      else seen.add(key);
    }
    if (dupes.length > 0) {
      errors.push(`duplicate field names within row: ${dupes.join(", ")}`);
    }

    if (errors.length > 0) {
      invalid.push({ index: dataIndex, errors });
      continue;
    }

    valid.push({
      index: dataIndex,
      row: {
        name,
        address: address || null,
        city: city || null,
        state,
        zip: zip || null,
        fields: fieldNames,
      },
    });
  }

  return { ok: true, valid, invalid, warnings };
}

// Helper for the server-side dedupe step. Same triple key used in both
// CSV-internal dedupe and DB-existing dedupe so they agree.
export function dedupeKey(name: string, city: string | null, state: string | null): string {
  return [
    name.trim().toLowerCase(),
    (city ?? "").trim().toLowerCase(),
    (state ?? "").trim().toUpperCase(),
  ].join("||");
}
