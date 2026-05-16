"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Header from "@/components/Header";
import OfferDialog from "@/components/scrimmages/OfferDialog";
import { ArrowLeft, Calendar, Clock, MapPin, Navigation, Users, MessageSquare } from "lucide-react";
import { usePermissions } from "@/lib/hooks/usePermissions";

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  open: { bg: "#00c85318", text: "#00c853", border: "#00c85340" },
  filled: { bg: "var(--badge-completed-bg)", text: "var(--badge-completed-text)", border: "var(--badge-completed-border)" },
  expired: { bg: "#5a5a5a18", text: "#888", border: "#5a5a5a40" },
  cancelled: { bg: "#ef444418", text: "#ef4444", border: "#ef444440" },
};

const OFFER_STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  pending: { bg: "#f59e0b18", text: "#f59e0b", border: "#f59e0b40" },
  accepted: { bg: "#00c85318", text: "#00c853", border: "#00c85340" },
  declined: { bg: "#ef444418", text: "#ef4444", border: "#ef444440" },
  withdrawn: { bg: "#5a5a5a18", text: "#888", border: "#5a5a5a40" },
};

const SCOPE_LABELS: Record<string, string> = {
  division: "Division only",
  league: "Same league",
  any: "Open to all",
};

function formatDate(iso: string) {
  const dateStr = iso.includes("T") ? iso.split("T")[0] : iso;
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function formatTime(t: string | null) {
  if (!t) return null;
  const [h, m] = t.split(":");
  const hr = parseInt(h, 10);
  const ampm = hr >= 12 ? "PM" : "AM";
  const h12 = hr % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

type Offer = {
  id: number;
  listing_id: number;
  team_id: number;
  team_name: string;
  league_name: string | null;
  division_name: string | null;
  division_age_range: string | null;
  status: string;
  proposed_location: string | null;
  proposed_time: string | null;
  message: string | null;
  created_at: string;
};

type Listing = {
  id: number;
  team_id: number;
  team_name: string;
  status: string;
  will_travel: boolean;
  travel_radius_miles: number | null;
  location_name: string | null;
  official_location_name: string | null;
  location_address: string | null;
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
  notes: string | null;
  pending_offers: number;
  created_at: string;
};

export default function ListingDetailPage() {
  const router = useRouter();
  const listingId = router.query.listingId as string;
  const { roles } = usePermissions();

  const [listing, setListing] = useState<Listing | null>(null);
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [offerOpen, setOfferOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const load = async () => {
    if (!listingId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/scrimmage-marketplace/${listingId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setListing(data.listing);
      setOffers(data.offers ?? null);
      setCanManage(data.canManage ?? false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [listingId]);

  const handleOfferAction = async (offerId: number, action: "accepted" | "declined") => {
    setActionLoading(offerId);
    try {
      const res = await fetch(`/api/scrimmage-marketplace/${listingId}/offers/${offerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: action }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Action failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async () => {
    if (!confirm("Cancel this listing? All pending offers will be withdrawn.")) return;
    try {
      const res = await fetch(`/api/scrimmage-marketplace/${listingId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to cancel");
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Cancel failed");
    }
  };

  // Check if the current user manages a different team (can offer)
  const managedTeamIds = roles
    .filter((r) => r.role === "team_manager" && r.scope_type === "team")
    .map((r) => r.scope_id);
  const canOffer =
    listing &&
    listing.status === "open" &&
    !canManage &&
    managedTeamIds.length > 0 &&
    !managedTeamIds.includes(listing.team_id);

  if (loading) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-7xl px-4 md:px-6 py-10">
          <div className="space-y-4">
            <div className="h-8 w-48 bg-elevated animate-pulse" />
            <div className="h-64 bg-elevated animate-pulse" />
          </div>
        </main>
      </>
    );
  }

  if (error || !listing) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-7xl px-4 md:px-6 py-10">
          <p className="text-destructive">{error || "Listing not found"}</p>
        </main>
      </>
    );
  }

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

  const statusColor = STATUS_COLORS[listing.status] ?? STATUS_COLORS.expired;

  return (
    <>
      <Header />

      <main className="mx-auto max-w-7xl px-4 md:px-6 pb-16">
        {/* Back link */}
        <Link
          href="/scrimmages"
          className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-primary text-[11px] uppercase tracking-[0.08em] mt-6 mb-6 transition-colors"
          style={{ fontFamily: "var(--font-body)" }}
        >
          <ArrowLeft className="h-3 w-3" />
          Back to Marketplace
        </Link>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-6 border-b border-border">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1
                className="text-foreground"
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 800,
                  fontSize: "28px",
                  letterSpacing: "-0.02em",
                  textTransform: "uppercase",
                }}
              >
                {listing.team_name}
              </h1>
              <span
                className="px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold"
                style={{
                  backgroundColor: statusColor.bg,
                  color: statusColor.text,
                  border: `1px solid ${statusColor.border}`,
                  fontFamily: "var(--font-body)",
                }}
              >
                {listing.status}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-muted-foreground" style={{ fontFamily: "var(--font-body)", fontSize: "12px" }}>
              {listing.league_abbr && (
                <span className="border border-border/60 px-2 py-0.5 text-[10px] uppercase tracking-wider">{listing.league_abbr}</span>
              )}
              {listing.division_name && (
                <span className="border border-border/60 px-2 py-0.5 text-[10px] uppercase tracking-wider">{listing.division_name}</span>
              )}
              {listing.sport_name && (
                <span className="border border-border/60 px-2 py-0.5 text-[10px] uppercase tracking-wider">{listing.sport_name}</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canOffer && (
              <button
                type="button"
                onClick={() => setOfferOpen(true)}
                className="bg-primary text-primary-foreground px-4 py-2 text-[11px] font-semibold tracking-[0.08em] uppercase hover:opacity-90 transition-opacity"
                style={{ fontFamily: "var(--font-body)" }}
              >
                Offer to Play
              </button>
            )}
            {canManage && listing.status === "open" && (
              <button
                type="button"
                onClick={handleCancel}
                className="border border-destructive/40 text-destructive px-4 py-2 text-[11px] font-semibold tracking-[0.08em] uppercase hover:bg-destructive/10 transition-colors"
                style={{ fontFamily: "var(--font-body)" }}
              >
                Cancel Listing
              </button>
            )}
          </div>
        </div>

        {/* Details grid */}
        <div className="grid md:grid-cols-2 gap-6 pt-6">
          {/* Left: Details card */}
          <div className="border border-border bg-card p-5 space-y-4">
            <div className="flex items-center gap-2 text-foreground">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span style={{ fontFamily: "var(--font-body)", fontSize: "14px" }}>
                {formatDate(listing.available_date)}
              </span>
            </div>

            <div className="flex items-center gap-2 text-foreground">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span style={{ fontFamily: "var(--font-body)", fontSize: "14px" }}>{timeStr}</span>
            </div>

            {listing.will_travel ? (
              <div className="flex items-center gap-2 text-primary">
                <Navigation className="h-4 w-4" />
                <span style={{ fontFamily: "var(--font-body)", fontSize: "14px" }}>
                  Will travel{listing.travel_radius_miles ? ` up to ${listing.travel_radius_miles} miles` : ""}
                </span>
              </div>
            ) : locDisplay ? (
              <div className="flex items-start gap-2 text-foreground">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div style={{ fontFamily: "var(--font-body)", fontSize: "14px" }}>
                  <div>{locDisplay}</div>
                  {locMeta && <div className="text-muted-foreground text-xs">{locMeta}</div>}
                </div>
              </div>
            ) : null}

            <div className="flex items-center gap-2 text-foreground">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span style={{ fontFamily: "var(--font-body)", fontSize: "14px" }}>
                {SCOPE_LABELS[listing.opponent_scope] || listing.opponent_scope}
              </span>
            </div>

            {ageStr && (
              <div className="text-foreground" style={{ fontFamily: "var(--font-body)", fontSize: "14px" }}>
                {ageStr}
              </div>
            )}

            {listing.notes && (
              <div className="border-t border-border pt-3 mt-3">
                <p className="text-sm text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                  {listing.notes}
                </p>
              </div>
            )}
          </div>

          {/* Right: Offers */}
          <div>
            <h2
              className="text-foreground mb-4"
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: "16px",
                textTransform: "uppercase",
                letterSpacing: "-0.01em",
              }}
            >
              Offers ({listing.pending_offers} pending)
            </h2>

            {canManage && offers && offers.length > 0 ? (
              <div className="space-y-3">
                {offers.map((offer) => {
                  const offerColor = OFFER_STATUS_COLORS[offer.status] ?? OFFER_STATUS_COLORS.withdrawn;
                  return (
                    <div
                      key={offer.id}
                      className="border border-border bg-card p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <span
                            className="text-foreground"
                            style={{
                              fontFamily: "var(--font-display)",
                              fontWeight: 700,
                              fontSize: "15px",
                              textTransform: "uppercase",
                              letterSpacing: "-0.01em",
                            }}
                          >
                            {offer.team_name}
                          </span>
                          <div className="flex flex-wrap items-center gap-2 mt-1 text-muted-foreground" style={{ fontFamily: "var(--font-body)", fontSize: "11px" }}>
                            {offer.league_name && <span>{offer.league_name}</span>}
                            {offer.division_name && (
                              <span className="border border-border/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wider">
                                {offer.division_name}
                              </span>
                            )}
                            {offer.division_age_range && <span>Ages {offer.division_age_range}</span>}
                          </div>
                        </div>

                        <span
                          className="px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold shrink-0"
                          style={{
                            backgroundColor: offerColor.bg,
                            color: offerColor.text,
                            border: `1px solid ${offerColor.border}`,
                            fontFamily: "var(--font-body)",
                          }}
                        >
                          {offer.status}
                        </span>
                      </div>

                      {(offer.proposed_location || offer.proposed_time || offer.message) && (
                        <div className="mt-3 space-y-1 text-sm text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                          {offer.proposed_location && (
                            <div className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" /> Proposed: {offer.proposed_location}
                            </div>
                          )}
                          {offer.proposed_time && (
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" /> Proposed time: {formatTime(offer.proposed_time)}
                            </div>
                          )}
                          {offer.message && (
                            <div className="flex items-start gap-1">
                              <MessageSquare className="h-3 w-3 mt-0.5" /> {offer.message}
                            </div>
                          )}
                        </div>
                      )}

                      {offer.status === "pending" && (
                        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
                          <button
                            type="button"
                            disabled={actionLoading === offer.id}
                            onClick={() => handleOfferAction(offer.id, "accepted")}
                            className="bg-primary text-primary-foreground px-3 py-1.5 text-[10px] font-semibold tracking-[0.08em] uppercase hover:opacity-90 transition-opacity disabled:opacity-40"
                            style={{ fontFamily: "var(--font-body)" }}
                          >
                            {actionLoading === offer.id ? "…" : "Accept"}
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading === offer.id}
                            onClick={() => handleOfferAction(offer.id, "declined")}
                            className="border border-border text-muted-foreground px-3 py-1.5 text-[10px] font-semibold tracking-[0.08em] uppercase hover:text-foreground hover:border-foreground transition-colors disabled:opacity-40"
                            style={{ fontFamily: "var(--font-body)" }}
                          >
                            Decline
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : canManage && offers && offers.length === 0 ? (
              <div className="border border-border bg-card p-6 text-center">
                <p className="text-muted-foreground text-sm" style={{ fontFamily: "var(--font-body)" }}>
                  No offers yet. Other managers will see this listing in the marketplace.
                </p>
              </div>
            ) : !canManage ? (
              <div className="border border-border bg-card p-6 text-center">
                <p className="text-muted-foreground text-sm" style={{ fontFamily: "var(--font-body)" }}>
                  {listing.pending_offers > 0
                    ? `${listing.pending_offers} team${listing.pending_offers !== 1 ? "s" : ""} interested`
                    : "Be the first to offer!"}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </main>

      {listing && (
        <OfferDialog
          open={offerOpen}
          onOpenChange={setOfferOpen}
          listingId={listing.id}
          listingTeamId={listing.team_id}
          onOffered={() => load()}
        />
      )}
    </>
  );
}
