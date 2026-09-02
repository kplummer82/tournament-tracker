// Parsing and shaping for a team's home location.
//
// A team is located either by a venue from the shared `locations` directory
// ("home_field") or by a Mapbox-resolved city/state ("city"). See
// database/migration_team_location.sql for the columns and the CHECK that
// keeps the two shapes from mixing.

export type TeamLocationType = "home_field" | "city";

export type TeamLocationInput = {
  locationType: TeamLocationType | null;
  homeLocationId: number | null;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
};

export const NO_TEAM_LOCATION: TeamLocationInput = {
  locationType: null,
  homeLocationId: null,
  city: null,
  state: null,
  latitude: null,
  longitude: null,
};

const toNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const toStr = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s === "" ? null : s;
};

export type ParsedTeamLocation = {
  /** Non-null when the body is invalid; the caller should 400 with it. */
  error: string | null;
  /**
   * `null` when the caller did not send `locationType` at all, which PATCH
   * treats as "leave the location alone" and POST treats as "no location yet"
   * (the season quick-add and API seeds go down this path).
   */
  value: TeamLocationInput | null;
};

/** Validate the location fields of a create/update body. */
export function parseTeamLocation(body: Record<string, unknown>): ParsedTeamLocation {
  if (!("locationType" in body)) return { error: null, value: null };

  const type = body.locationType;

  if (type === null || type === undefined || type === "") {
    return { error: null, value: { ...NO_TEAM_LOCATION } };
  }

  if (type === "home_field") {
    const id = toNum(body.homeLocationId);
    if (id == null || id <= 0) {
      return {
        error: "homeLocationId is required when locationType is 'home_field'",
        value: null,
      };
    }
    return {
      error: null,
      value: { ...NO_TEAM_LOCATION, locationType: "home_field", homeLocationId: id },
    };
  }

  if (type === "city") {
    const city = toStr(body.city);
    if (!city) {
      return { error: "city is required when locationType is 'city'", value: null };
    }
    return {
      error: null,
      value: {
        locationType: "city",
        homeLocationId: null,
        city,
        state: toStr(body.state),
        latitude: toNum(body.latitude),
        longitude: toNum(body.longitude),
      },
    };
  }

  return { error: "locationType must be 'home_field', 'city' or null", value: null };
}

/**
 * Display label for a team row already joined to its home location.
 * `city`/`state` here are the effective values (the team's own for a city
 * team, the venue's for a home-field team).
 */
export function teamLocationLabel(row: {
  location_type?: string | null;
  home_location_name?: string | null;
  city?: string | null;
  state?: string | null;
}): string | null {
  if (row.location_type === "home_field") return row.home_location_name ?? null;
  if (row.location_type === "city") {
    return row.city ? [row.city, row.state].filter(Boolean).join(", ") : null;
  }
  return null;
}
