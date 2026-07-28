// components/venues/VenuesMap.tsx
// Read-only map of a competition's venues. Only predefined venues carry
// coordinates (from the linked global location); custom venues have none and
// are surfaced by LocationsMap's built-in "without coordinates" caption.
"use client";
import dynamic from "next/dynamic";
import { useMemo } from "react";
import type { VenueDTO } from "@/components/venues/types";
import type { MapLocation } from "@/components/admin/LocationsMap";

// LocationsMap touches `window` (mapbox-gl); load it client-side only.
const LocationsMap = dynamic(() => import("@/components/admin/LocationsMap"), {
  ssr: false,
  loading: () => <div className="h-[420px] bg-elevated animate-pulse" />,
});

export default function VenuesMap({ venues }: { venues: VenueDTO[] }) {
  const locations = useMemo<MapLocation[]>(
    () =>
      venues.map((v) => ({
        id: v.id,
        name: v.name,
        address: v.address,
        city: v.city,
        state: v.state,
        zip: null,
        latitude: v.latitude,
        longitude: v.longitude,
        field_count: v.fields.length,
      })),
    [venues],
  );

  return <LocationsMap locations={locations} />;
}
