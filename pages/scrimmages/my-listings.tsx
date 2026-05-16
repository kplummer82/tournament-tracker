"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import ListingCard, { type ListingRow } from "@/components/scrimmages/ListingCard";
import CreateListingModal from "@/components/scrimmages/CreateListingModal";
import { ArrowLeft, Calendar, Clock, MapPin } from "lucide-react";

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

function formatDate(iso: string) {
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

type OfferRow = {
  id: number;
  listing_id: number;
  team_id: number;
  offer_team_name: string;
  status: string;
  proposed_location: string | null;
  proposed_time: string | null;
  message: string | null;
  created_at: string;
  available_date: string;
  time_earliest: string | null;
  time_latest: string | null;
  listing_location: string | null;
  listing_status: string;
  listing_team_name: string;
  listing_league_name: string | null;
  listing_division_name: string | null;
};

type Tab = "listings" | "offers";

export default function MyListingsPage() {
  const [tab, setTab] = useState<Tab>("listings");
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [loadingListings, setLoadingListings] = useState(true);
  const [loadingOffers, setLoadingOffers] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const loadListings = async () => {
    setLoadingListings(true);
    try {
      const res = await fetch("/api/scrimmage-marketplace/my-listings");
      if (res.ok) {
        const data = await res.json();
        setListings(data.listings ?? []);
      }
    } catch { /* ignore */ } finally { setLoadingListings(false); }
  };

  const loadOffers = async () => {
    setLoadingOffers(true);
    try {
      const res = await fetch("/api/scrimmage-marketplace/my-offers");
      if (res.ok) {
        const data = await res.json();
        setOffers(data.offers ?? []);
      }
    } catch { /* ignore */ } finally { setLoadingOffers(false); }
  };

  useEffect(() => { loadListings(); loadOffers(); }, []);

  const handleWithdraw = async (offerId: number, listingId: number) => {
    if (!confirm("Withdraw this offer?")) return;
    try {
      const res = await fetch(`/api/scrimmage-marketplace/${listingId}/offers/${offerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "withdrawn" }),
      });
      if (res.ok) loadOffers();
    } catch { /* ignore */ }
  };

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

        {/* Title */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pb-6 border-b border-border">
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
            My Scrimmages
          </h1>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="bg-primary text-primary-foreground px-4 py-2 text-[11px] font-semibold tracking-[0.08em] uppercase hover:opacity-90 transition-opacity"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Post Listing
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-0 mt-4 mb-4 border-b border-border">
          {([
            { key: "listings" as Tab, label: "My Listings", count: listings.length },
            { key: "offers" as Tab, label: "My Offers", count: offers.length },
          ]).map(({ key, label, count }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`relative px-5 py-3 text-[11px] font-medium tracking-[0.1em] uppercase transition-colors duration-100 ${
                tab === key
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              style={{ fontFamily: "var(--font-body)" }}
            >
              {label} ({count})
              {tab === key && (
                <span className="absolute bottom-0 left-4 right-4 h-[2px] bg-primary" />
              )}
            </button>
          ))}
        </div>

        {/* Listings tab */}
        {tab === "listings" && (
          <div className="border border-border bg-card">
            {loadingListings ? (
              <div className="space-y-0">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-[72px] border-b border-border last:border-0 bg-elevated animate-pulse" />
                ))}
              </div>
            ) : listings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-foreground font-medium mb-1 uppercase tracking-wide text-sm" style={{ fontFamily: "var(--font-display)" }}>
                  No Listings
                </p>
                <p className="text-sm text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                  Post a listing to find scrimmage opponents.
                </p>
              </div>
            ) : (
              listings.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))
            )}
          </div>
        )}

        {/* Offers tab */}
        {tab === "offers" && (
          <div className="border border-border bg-card">
            {loadingOffers ? (
              <div className="space-y-0">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-[72px] border-b border-border last:border-0 bg-elevated animate-pulse" />
                ))}
              </div>
            ) : offers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-foreground font-medium mb-1 uppercase tracking-wide text-sm" style={{ fontFamily: "var(--font-display)" }}>
                  No Offers
                </p>
                <p className="text-sm text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                  Browse the marketplace to find teams looking for scrimmages.
                </p>
              </div>
            ) : (
              offers.map((offer) => {
                const offerColor = OFFER_STATUS_COLORS[offer.status] ?? OFFER_STATUS_COLORS.withdrawn;
                const listingColor = STATUS_COLORS[offer.listing_status] ?? STATUS_COLORS.expired;

                return (
                  <div
                    key={offer.id}
                    className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 py-4 pl-4 pr-5 border-b border-border last:border-0"
                  >
                    {/* Listing info */}
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/scrimmages/${offer.listing_id}`}
                        className="hover:text-primary transition-colors"
                      >
                        <span
                          className="block truncate text-foreground"
                          style={{
                            fontFamily: "var(--font-display)",
                            fontWeight: 700,
                            fontSize: "15px",
                            textTransform: "uppercase",
                            letterSpacing: "-0.01em",
                          }}
                        >
                          vs {offer.listing_team_name}
                        </span>
                      </Link>
                      <div
                        className="flex flex-wrap items-center gap-2 mt-0.5 text-muted-foreground"
                        style={{ fontFamily: "var(--font-body)", fontSize: "11px" }}
                      >
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(offer.available_date)}
                        </span>
                        {offer.listing_location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {offer.listing_location}
                          </span>
                        )}
                        <span className="text-[10px]">
                          as {offer.offer_team_name}
                        </span>
                      </div>
                    </div>

                    {/* Status badges + actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className="px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold"
                        style={{
                          backgroundColor: offerColor.bg,
                          color: offerColor.text,
                          border: `1px solid ${offerColor.border}`,
                          fontFamily: "var(--font-body)",
                        }}
                      >
                        {offer.status}
                      </span>

                      {offer.status === "pending" && (
                        <button
                          type="button"
                          onClick={() => handleWithdraw(offer.id, offer.listing_id)}
                          className="text-[10px] tracking-[0.08em] uppercase text-muted-foreground hover:text-destructive transition-colors"
                          style={{ fontFamily: "var(--font-body)" }}
                        >
                          Withdraw
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </main>

      <CreateListingModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => loadListings()}
      />
    </>
  );
}
