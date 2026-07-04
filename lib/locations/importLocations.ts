// Shared insert logic for bulk location imports.
// Mirrors the single-create flow in pages/api/locations/index.ts:
// Mapbox geocode → INSERT location → INSERT each field.

import { sql } from "@/lib/db";
import { geocodeAddress } from "@/lib/mapbox/geocodeAddress";
import type { ParsedRow } from "./parseBulkCsv";

export type ImportedLocation = {
  id: number;
  name: string;
  field_count: number;
};

export async function importOne(row: ParsedRow): Promise<ImportedLocation> {
  const finalAddress = row.address;
  const finalCity = row.city;
  const finalState = row.state;
  const finalZip = row.zip;
  let finalLat: number | null = null;
  let finalLng: number | null = null;

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
    INSERT INTO locations (name, address, city, state, zip, latitude, longitude)
    VALUES (${row.name}, ${finalAddress}, ${finalCity}, ${finalState}, ${finalZip}, ${finalLat}, ${finalLng})
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
