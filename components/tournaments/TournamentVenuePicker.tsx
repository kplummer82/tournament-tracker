// components/tournaments/TournamentVenuePicker.tsx
// Thin adapter over the scope-agnostic VenuePicker. Keeps the existing
// tournament-facing value shape (tournamentVenueId) so its consumers
// (AddGameModal, BracketGameScheduleModal) are unchanged.
"use client";
import VenuePicker from "@/components/venues/VenuePicker";

export interface TournamentVenuePickerValue {
  tournamentVenueId: number | null;
  locationId: number | null;
  location: string;   // human label used by legacy display code
  field: string;
}

interface Props {
  tournamentId: number;
  value: TournamentVenuePickerValue;
  onChange: (v: TournamentVenuePickerValue) => void;
}

export default function TournamentVenuePicker({ tournamentId, value, onChange }: Props) {
  return (
    <VenuePicker
      basePath={`/api/tournaments/${tournamentId}/venues`}
      setupHref={`/tournaments/${tournamentId}/venues`}
      value={{
        venueId: value.tournamentVenueId,
        locationId: value.locationId,
        location: value.location,
        field: value.field,
      }}
      onChange={(v) =>
        onChange({
          tournamentVenueId: v.venueId,
          locationId: v.locationId,
          location: v.location,
          field: v.field,
        })
      }
    />
  );
}
