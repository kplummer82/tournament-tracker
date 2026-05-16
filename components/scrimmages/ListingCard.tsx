"use client";

import Link from "next/link";
import { ArrowRight, MapPin, Navigation, Calendar, Clock, Users } from "lucide-react";

export type ListingRow = {
  id: number;
  team_id: number;
  team_name: string;
  status: string;
  will_travel: boolean;
  travel_radius_miles: number | null;
  location_name: string | null;
  official_location_name: string | null;
  location_city: string | null;
  location_state: string | null;
  available_date: string;
  time_earliest: string | null;
  time_latest: string | null;
  opponent_scope: string;
  age_range_min: number | null;
  age_range_max: number | null;
  sport_name: string | null;
  league_name: string | null;
  league_abbr: string | null;
  division_name: string | null;
  division_age_range: string | null;
  pending_offers: number;
  distance_miles?: number | null;
  notes: string | null;
};

const SCOPE_LABELS: Record<string, string> = {
  division: "Division only",
  league: "League only",
  any: "Open to all",
};

function formatDate(iso: string) {
  // Handle both "2026-05-15" and "2026-05-15T00:00:00.000Z" formats
  const dateStr = iso.includes("T") ? iso.split("T")[0] : iso;
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatTime(t: string | null) {
  if (!t) return null;
  const [h, m] = t.split(":");
  const hr = parseInt(h, 10);
  const ampm = hr >= 12 ? "PM" : "AM";
  const h12 = hr % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

export default function ListingCard({ listing }: { listing: ListingRow }) {
  const locDisplay = listing.official_location_name || listing.location_name;
  const locMeta = [listing.location_city, listing.location_state].filter(Boolean).join(", ");

  const timeStr =
    listing.time_earliest && listing.time_latest
      ? `${formatTime(listing.time_earliest)} – ${formatTime(listing.time_latest)}`
      : listing.time_earliest
        ? `From ${formatTime(listing.time_earliest)}`
        : listing.time_latest
          ? `Until ${formatTime(listing.time_latest)}`
          : "Flexible";

  const ageStr =
    listing.age_range_min != null && listing.age_range_max != null
      ? `Ages ${listing.age_range_min}–${listing.age_range_max}`
      : listing.age_range_min != null
        ? `Ages ${listing.age_range_min}+`
        : listing.age_range_max != null
          ? `Ages ≤${listing.age_range_max}`
          : null;

  return (
    <Link
      href={`/scrimmages/${listing.id}`}
      className="group flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 py-4 pl-4 pr-5 border-b border-border last:border-0 hover:bg-elevated transition-colors duration-100"
    >
      {/* Left: team + meta */}
      <div className="flex-1 min-w-0">
        {/* Team name */}
        <span
          className="block truncate text-foreground group-hover:text-primary transition-colors duration-100"
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: "17px",
            textTransform: "uppercase",
            letterSpacing: "-0.01em",
          }}
        >
          {listing.team_name}
        </span>

        {/* Badges row */}
        <div
          className="flex flex-wrap items-center gap-2 mt-1 text-muted-foreground"
          style={{ fontFamily: "var(--font-body)", fontSize: "12px" }}
        >
          {listing.league_abbr && (
            <span className="border border-border/60 px-2 py-0.5 text-[10px] uppercase tracking-wider">
              {listing.league_abbr}
            </span>
          )}
          {listing.division_name && (
            <span className="border border-border/60 px-2 py-0.5 text-[10px] uppercase tracking-wider">
              {listing.division_name}
            </span>
          )}
          {listing.sport_name && (
            <span className="border border-border/60 px-2 py-0.5 text-[10px] uppercase tracking-wider">
              {listing.sport_name}
            </span>
          )}
          {ageStr && (
            <span>{ageStr}</span>
          )}
        </div>
      </div>

      {/* Middle: date, time, location, scope */}
      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground shrink-0"
        style={{ fontFamily: "var(--font-body)", fontSize: "12px" }}
      >
        <span className="flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {formatDate(listing.available_date)}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {timeStr}
        </span>

        {listing.will_travel ? (
          <span className="flex items-center gap-1 text-primary">
            <Navigation className="h-3 w-3" />
            Will travel{listing.travel_radius_miles ? ` (${listing.travel_radius_miles} mi)` : ""}
          </span>
        ) : locDisplay ? (
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {locDisplay}{locMeta ? `, ${locMeta}` : ""}
          </span>
        ) : null}

        <span className="flex items-center gap-1">
          <Users className="h-3 w-3" />
          {SCOPE_LABELS[listing.opponent_scope] || listing.opponent_scope}
        </span>

        {listing.distance_miles != null && (
          <span className="text-primary font-medium">
            {listing.distance_miles.toFixed(1)} mi away
          </span>
        )}
      </div>

      {/* Right: offers badge + arrow */}
      <div className="flex items-center gap-3 shrink-0">
        {listing.pending_offers > 0 && (
          <span
            className="bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
          >
            {listing.pending_offers} offer{listing.pending_offers !== 1 ? "s" : ""}
          </span>
        )}
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all duration-100 shrink-0" />
      </div>
    </Link>
  );
}
