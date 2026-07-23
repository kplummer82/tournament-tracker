// Payload/snapshot shapes for crowdsourced location suggestions.
// The same schemas validate a payload twice: at submission (POST
// /api/locations/suggestions) and again at approve time, because the payload
// sits in JSONB between the two and the table can't enforce its shape.
import { z } from "zod";

export const SUGGESTION_TYPES = ["edit", "new", "removal"] as const;
export type SuggestionType = (typeof SUGGESTION_TYPES)[number];
export const suggestionTypeSchema = z.enum(SUGGESTION_TYPES);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => (s.length ? s : null))
    .nullable()
    .optional();

const fieldName = z.string().trim().min(1).max(100);

// Attribute surface mirrors the editable columns of `locations`.
const attributesSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    address: optionalText(300),
    city: optionalText(100),
    state: optionalText(20),
    zip: optionalText(20),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
  })
  .strict();

export const editPayloadSchema = z
  .object({
    attributes: attributesSchema.optional(),
    fields: z
      .object({
        add: z.array(fieldName).max(20).optional(),
        rename: z
          .array(
            z.object({
              id: z.number().int().positive(),
              from: z.string().max(100),
              to: fieldName,
            })
          )
          .max(20)
          .optional(),
        remove: z
          .array(
            z.object({
              id: z.number().int().positive(),
              name: z.string().max(100),
            })
          )
          .max(20)
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine(
    (p) =>
      (p.attributes && Object.keys(p.attributes).length > 0) ||
      (p.fields &&
        ((p.fields.add?.length ?? 0) > 0 ||
          (p.fields.rename?.length ?? 0) > 0 ||
          (p.fields.remove?.length ?? 0) > 0)),
    { message: "Suggest at least one attribute or field change" }
  );

export const newPayloadSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    address: optionalText(300),
    city: optionalText(100),
    state: optionalText(20),
    zip: optionalText(20),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    fields: z.array(fieldName).max(20).optional(),
  })
  .strict();

export const REMOVAL_REASONS = ["closed", "duplicate", "wrong", "other"] as const;

export const removalPayloadSchema = z
  .object({
    removal_reason: z.enum(REMOVAL_REASONS),
    duplicate_of_location_id: z.number().int().positive().optional(),
  })
  .strict();

export type EditPayload = z.infer<typeof editPayloadSchema>;
export type NewPayload = z.infer<typeof newPayloadSchema>;
export type RemovalPayload = z.infer<typeof removalPayloadSchema>;

export function parsePayload(
  type: SuggestionType,
  payload: unknown
):
  | { ok: true; type: "edit"; payload: EditPayload }
  | { ok: true; type: "new"; payload: NewPayload }
  | { ok: true; type: "removal"; payload: RemovalPayload }
  | { ok: false; error: string } {
  const schema =
    type === "edit" ? editPayloadSchema : type === "new" ? newPayloadSchema : removalPayloadSchema;
  const result = schema.safeParse(payload);
  if (!result.success) {
    const first = result.error.issues[0];
    return {
      ok: false,
      error: first ? `${first.path.join(".") || "payload"}: ${first.message}` : "Invalid payload",
    };
  }
  return { ok: true, type, payload: result.data } as
    | { ok: true; type: "edit"; payload: EditPayload }
    | { ok: true; type: "new"; payload: NewPayload }
    | { ok: true; type: "removal"; payload: RemovalPayload };
}

// ---------------------------------------------------------------------------
// Snapshot: the target's live values captured at submission time. Powers the
// admin diff view, staleness detection at approve time, and history display
// after the target row is deleted (location_id goes NULL via ON DELETE SET NULL).

export type LocationSnapshot = {
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
  fields: { id: number; name: string }[];
};

const toNum = (v: unknown): number | null => {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

/** Normalize a locations row + its fields into the snapshot shape (NUMERIC
 * columns arrive as strings from the driver). */
export function buildSnapshot(
  row: Record<string, unknown>,
  fields: { id: number; name: string }[]
): LocationSnapshot {
  return {
    name: (row.name as string) ?? null,
    address: (row.address as string) ?? null,
    city: (row.city as string) ?? null,
    state: (row.state as string) ?? null,
    zip: (row.zip as string) ?? null,
    latitude: toNum(row.latitude),
    longitude: toNum(row.longitude),
    fields: fields
      .map((f) => ({ id: f.id, name: f.name }))
      .sort((a, b) => a.id - b.id),
  };
}

/** True when the target changed since the snapshot was taken — the admin must
 * force-approve (or reject) a stale suggestion. Coords compare at ~1e-6°
 * (≈0.1 m) so NUMERIC round-tripping never reads as an edit. */
export function isSnapshotStale(snapshot: LocationSnapshot, current: LocationSnapshot): boolean {
  const textKeys = ["name", "address", "city", "state", "zip"] as const;
  for (const k of textKeys) {
    if ((snapshot[k] ?? null) !== (current[k] ?? null)) return true;
  }
  const coordDiffers = (a: number | null, b: number | null) =>
    a == null || b == null ? a !== b : Math.abs(a - b) > 1e-6;
  if (coordDiffers(snapshot.latitude, current.latitude)) return true;
  if (coordDiffers(snapshot.longitude, current.longitude)) return true;

  if (snapshot.fields.length !== current.fields.length) return true;
  for (let i = 0; i < snapshot.fields.length; i++) {
    if (
      snapshot.fields[i].id !== current.fields[i].id ||
      snapshot.fields[i].name !== current.fields[i].name
    ) {
      return true;
    }
  }
  return false;
}
