// AI advisor for location suggestions. Advisory-only by design: it runs in
// the background after submission (waitUntil), writes its recommendation to
// the ai_* columns, and NEVER throws — a failed analysis lands as
// ai_status='error' and the human review queue works regardless.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { sql } from "@/lib/db";
import { geocodeAddress } from "@/lib/mapbox/geocodeAddress";
import { parsePayload, type LocationSnapshot } from "@/lib/suggestions/types";

const AI_MODEL = process.env.SUGGESTION_AI_MODEL ?? "claude-haiku-4-5";

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// Structured-output schema. Range constraints aren't part of the API-side
// grammar, so confidence is clamped in code after parsing.
const advisorResultSchema = z.object({
  recommendation: z.enum(["approve", "reject", "unsure"]),
  confidence: z.number(),
  rationale: z.string(),
  duplicate_location_ids: z.array(z.number()),
  flags: z.array(z.string()),
});

const SYSTEM_PROMPT = `You are a data-quality reviewer for a youth-sports facility directory. You will receive a suggested change (a new location proposal, an edit to an existing location, or a removal request) as JSON, along with the current database values where applicable, a list of possibly-duplicate existing locations with distances, and an independent geocoding result for the proposed address.

Assess:
1. Is the proposed data plausible and internally consistent? (Address matches city/state/zip; proposed coordinates within a reasonable distance of the independently geocoded address; field names sensible for sports facilities, like "Field 1", "Diamond A", "North Field".)
2. For a NEW location: is it likely a duplicate of one of the listed candidates? Report candidate ids in duplicate_location_ids.
3. For a REMOVAL request: is the stated reason coherent with the evidence provided?
4. Any signs of spam, test data, or vandalism (gibberish names, joke content, profanity, obviously fake addresses).

You are advisory only — a human admin makes the final decision. Prefer "unsure" over false confidence; recommend "reject" only with concrete evidence. Report every concern in flags (short snake_case labels like "address_mismatch", "possible_duplicate", "nonsense_content") even if minor. Keep the rationale to 2-4 admin-facing sentences.`;

type Candidate = {
  id: number;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  distance_km: number | null;
};

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const toNum = (v: unknown): number | null => {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

/** Possibly-duplicate existing locations, by name match or same city, ranked
 * by distance when coords are known. Soft-fails to an empty list. */
async function findDuplicateCandidates(
  name: string | null,
  city: string | null,
  lat: number | null,
  lng: number | null,
  excludeId: number | null
): Promise<Candidate[]> {
  try {
    const rows = await sql`
      SELECT id, name, address, city, state, latitude, longitude
      FROM locations
      WHERE (${name ?? null}::text IS NOT NULL AND name ILIKE '%' || ${name ?? ""} || '%')
         OR (${city ?? null}::text IS NOT NULL AND city IS NOT NULL AND LOWER(city) = LOWER(${city ?? ""}))
      LIMIT 25
    `;
    return (rows as any[])
      .filter((r) => r.id !== excludeId)
      .map((r) => {
        const rLat = toNum(r.latitude);
        const rLng = toNum(r.longitude);
        return {
          id: r.id,
          name: r.name,
          address: r.address,
          city: r.city,
          state: r.state,
          distance_km:
            lat != null && lng != null && rLat != null && rLng != null
              ? Math.round(haversineKm(lat, lng, rLat, rLng) * 10) / 10
              : null,
        };
      })
      .sort((a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity))
      .slice(0, 8);
  } catch {
    return [];
  }
}

/**
 * Analyze one suggestion and persist the result to its ai_* columns.
 * Never throws; safe to pass directly to waitUntil().
 */
export async function analyzeSuggestion(suggestionId: number): Promise<void> {
  try {
    await sql`
      UPDATE location_suggestions
      SET ai_status = 'running', ai_error = NULL
      WHERE id = ${suggestionId}
    `;

    const rows = await sql`
      SELECT id, suggestion_type, location_id, payload, snapshot, reason
      FROM location_suggestions WHERE id = ${suggestionId}
    `;
    if (!rows.length) return;
    const suggestion: any = rows[0];

    const parsed = parsePayload(suggestion.suggestion_type, suggestion.payload);
    if (parsed.ok === false) throw new Error(`Stored payload invalid: ${parsed.error}`);
    const snapshot = suggestion.snapshot as LocationSnapshot | null;

    // ---- Deterministic context gathering (each part soft-fails) ----
    let proposedName: string | null = null;
    let proposedCity: string | null = null;
    let proposedAddress: { address: string | null; city: string | null; state: string | null; zip: string | null } | null = null;
    let proposedLat: number | null = null;
    let proposedLng: number | null = null;

    if (parsed.type === "new") {
      proposedName = parsed.payload.name;
      proposedCity = parsed.payload.city ?? null;
      proposedAddress = {
        address: parsed.payload.address ?? null,
        city: parsed.payload.city ?? null,
        state: parsed.payload.state ?? null,
        zip: parsed.payload.zip ?? null,
      };
      proposedLat = parsed.payload.latitude ?? null;
      proposedLng = parsed.payload.longitude ?? null;
    } else if (parsed.type === "edit") {
      const attrs = parsed.payload.attributes ?? {};
      proposedName = attrs.name ?? snapshot?.name ?? null;
      proposedCity = attrs.city ?? snapshot?.city ?? null;
      if (attrs.address != null || attrs.city != null || attrs.state != null || attrs.zip != null) {
        proposedAddress = {
          address: attrs.address ?? snapshot?.address ?? null,
          city: attrs.city ?? snapshot?.city ?? null,
          state: attrs.state ?? snapshot?.state ?? null,
          zip: attrs.zip ?? snapshot?.zip ?? null,
        };
      }
      proposedLat = attrs.latitude ?? null;
      proposedLng = attrs.longitude ?? null;
    } else {
      proposedName = snapshot?.name ?? null;
      proposedCity = snapshot?.city ?? null;
    }

    const duplicateCandidates =
      parsed.type === "new" || parsed.type === "edit"
        ? await findDuplicateCandidates(
            proposedName,
            proposedCity,
            proposedLat,
            proposedLng,
            suggestion.location_id ?? null
          )
        : [];

    // Independent geocode of the proposed address; distance to the proposed
    // coords is the mismatch signal. geocodeAddress returns null on failure.
    let geocodeCheck: { geocoded_place: string; distance_from_proposed_km: number | null } | null = null;
    if (proposedAddress?.address) {
      const geocoded = await geocodeAddress({ name: proposedName, ...proposedAddress });
      if (geocoded) {
        geocodeCheck = {
          geocoded_place: geocoded.place,
          distance_from_proposed_km:
            proposedLat != null && proposedLng != null
              ? Math.round(haversineKm(proposedLat, proposedLng, geocoded.lat, geocoded.lng) * 10) / 10
              : null,
        };
      }
    }

    let dupTarget: Record<string, unknown> | null = null;
    if (parsed.type === "removal" && parsed.payload.duplicate_of_location_id) {
      const dupRows = await sql`
        SELECT id, name, address, city, state FROM locations
        WHERE id = ${parsed.payload.duplicate_of_location_id}
      `.catch(() => []);
      dupTarget = (dupRows as any[])[0] ?? null;
    }

    const context = {
      suggestion_type: suggestion.suggestion_type,
      proposed_change: suggestion.payload,
      submitter_note: suggestion.reason ?? null,
      current_values_at_submission: snapshot,
      possibly_duplicate_locations: duplicateCandidates,
      independent_geocode_of_proposed_address: geocodeCheck,
      claimed_duplicate_target: dupTarget,
    };

    // ---- Model judgment ----
    const client = new Anthropic();
    const response = await client.messages.parse({
      model: AI_MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: JSON.stringify(context, null, 2) }],
      output_config: { format: zodOutputFormat(advisorResultSchema) },
    });
    const result = response.parsed_output;
    if (!result) throw new Error("Model returned unparseable output");

    const confidence = Math.min(1, Math.max(0, result.confidence));
    const flags = JSON.stringify({
      flags: result.flags,
      duplicate_location_ids: result.duplicate_location_ids,
    });

    await sql`
      UPDATE location_suggestions
      SET ai_status = 'completed',
          ai_recommendation = ${result.recommendation},
          ai_confidence = ${confidence},
          ai_rationale = ${result.rationale},
          ai_flags = ${flags}::jsonb,
          ai_model = ${AI_MODEL},
          ai_analyzed_at = NOW(),
          ai_error = NULL
      WHERE id = ${suggestionId}
    `;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Analysis failed";
    console.error("[aiAdvisor]", suggestionId, err);
    await sql`
      UPDATE location_suggestions
      SET ai_status = 'error', ai_error = ${msg.slice(0, 500)}
      WHERE id = ${suggestionId}
    `.catch(() => {});
  }
}
