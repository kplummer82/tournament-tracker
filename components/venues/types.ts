// components/venues/types.ts
// Canonical DTO shared by tournament- and season-scoped venue UI. Structurally
// identical to the VenueDTO returned by lib/tournaments/venues.ts and
// lib/seasons/venues.ts.
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
  fields: VenueFieldDTO[];
};
