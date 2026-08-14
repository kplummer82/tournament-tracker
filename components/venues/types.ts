// components/venues/types.ts
// Canonical DTO shared by tournament- and season-scoped venue UI. Structurally
// identical to the VenueDTO returned by lib/tournaments/venues.ts and
// lib/seasons/venues.ts.
/** Placeholder field name used when a game's exact field isn't decided yet. */
export const TBD_FIELD = "TBD";

export type VenueFieldDTO = {
  id: number;
  name: string;
  sortOrder: number;
};

export type VenueDTO = {
  id: number;
  kind: "predefined" | "custom";
  locationId: number | null;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  sortOrder: number;
  gameCount: number;
  /**
   * Fields in play for this tournament/season. Pickers read only this, so a
   * field switched off in the venues tab drops out of scheduling automatically.
   */
  fields: VenueFieldDTO[];
  /** Switched-off fields — shown greyed in the venues tab, nowhere else. */
  inactiveFields: VenueFieldDTO[];
};
