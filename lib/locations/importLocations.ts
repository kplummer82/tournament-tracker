// Shared insert logic for bulk location imports.
// Mirrors the single-create flow in pages/api/locations/index.ts:
// USPS verify (when enabled + full address) → Mapbox geocode → INSERT location → INSERT each field.

import { sql } from "@/lib/db";
import { verifyAddress } from "@/lib/usps";
import { geocodeAddress } from "@/lib/mapbox/geocodeAddress";
import type { ParsedRow } from "./parseBulkCsv";

export type ImportedLocation = {
  id: number;
  name: string;
  field_count: number;
};

let uspsEnabledCache: { value: boolean; expiresAt: number } | null = null;
const USPS_CACHE_TTL_MS = 60_000;

async function isUspsEnabled(): Promise<boolean> {
  if (uspsEnabledCache && Date.now() < uspsEnabledCache.expiresAt) {
    return uspsEnabledCache.value;
  }
  try {
    const rows = await sql`SELECT value FROM app_settings WHERE key = 'usps_enabled'`;
    const enabled = !rows.length || rows[0].value !== "false";
    uspsEnabledCache = { value: enabled, expiresAt: Date.now() + USPS_CACHE_TTL_MS };
    return enabled;
  } catch {
    return true;
  }
}

export async function importOne(row: ParsedRow): Promise<ImportedLocation> {
  let finalAddress = row.address;
  let finalCity = row.city;
  let finalState = row.state;
  let finalZip = row.zip;
  let finalLat: number | null = null;
  let finalLng: number | null = null;
  let uspsVerified = false;

  const uspsEnabled = await isUspsEnabled();
  if (uspsEnabled && finalAddress && finalCity && finalState && finalZip) {
    const result = await verifyAddress({
      address: finalAddress,
      city: finalCity,
      state: finalState,
      zip: finalZip,
    });
    if (result.verified) {
      finalAddress = result.address;
      finalCity = result.city;
      finalState = result.state;
      finalZip = result.zip;
      uspsVerified = true;
    }
  }

  const geocoded = await geocodeAddress({
    name: row.name,
    address: finalAddress,
    city: finalCity,
    state: finalState,
    zip: finalZip,
  });
  if (geocoded) {
    finalLat = geocoded.lat;
    finalLng = geocoded.lng;
  }

  const inserted = await sql`
    INSERT INTO locations (name, address, city, state, zip, latitude, longitude, usps_verified)
    VALUES (${row.name}, ${finalAddress}, ${finalCity}, ${finalState}, ${finalZip}, ${finalLat}, ${finalLng}, ${uspsVerified})
    RETURNING id, name
  `;
  const locationId = inserted[0].id as number;

  let fieldCount = 0;
  for (const fieldName of row.fields) {
    try {
      await sql`
        INSERT INTO location_fields (location_id, name)
        VALUES (${locationId}, ${fieldName})
      `;
      fieldCount++;
    } catch (err: any) {
      // Tolerate UNIQUE(location_id, name) collisions inside a single insert;
      // shouldn't happen because parseBulkCsv dedupes within a row, but be safe.
      if (err?.code !== "23505") throw err;
    }
  }

  return { id: locationId, name: inserted[0].name, field_count: fieldCount };
}
