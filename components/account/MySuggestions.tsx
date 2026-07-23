"use client";

import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

type Suggestion = {
  id: number;
  suggestion_type: "edit" | "new" | "removal";
  location_name: string | null;
  status: "pending" | "approved" | "rejected" | "superseded";
  review_note: string | null;
  submitted_at: string;
  reviewed_at: string | null;
};

const TYPE_LABELS: Record<Suggestion["suggestion_type"], string> = {
  edit: "Edit",
  new: "New location",
  removal: "Removal",
};

const STATUS_BADGES: Record<Suggestion["status"], string> = {
  pending: "text-amber-700 border-amber-500/30 bg-amber-500/10 dark:text-amber-300",
  approved: "text-emerald-700 border-emerald-500/30 bg-emerald-500/10 dark:text-emerald-300",
  rejected: "text-destructive border-destructive/30 bg-destructive/10",
  superseded: "text-muted-foreground border-border bg-muted",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * The user's crowdsourced location suggestions and their review outcomes.
 * Renders nothing for users who can't submit (403) or never have.
 */
export default function MySuggestions() {
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);

  useEffect(() => {
    fetch("/api/locations/suggestions", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setSuggestions(d?.suggestions ?? []))
      .catch(() => setSuggestions([]));
  }, []);

  if (!suggestions?.length) return null;

  return (
    <section className="border border-border bg-card p-6">
      <h2 className="label-section mb-2" style={{ fontSize: "13px" }}>
        Location Suggestions
      </h2>
      <p className="text-sm text-muted-foreground mb-4" style={{ fontFamily: "var(--font-body)" }}>
        Changes you&rsquo;ve suggested to the location directory and their review status.
      </p>

      <ul className="divide-y divide-border">
        {suggestions.map((s) => (
          <li key={s.id} className="py-3">
            <p
              className="text-sm text-foreground flex items-center gap-2 flex-wrap"
              style={{ fontFamily: "var(--font-body)" }}
            >
              <MapPin className="h-3 w-3 shrink-0 text-primary" />
              <span className="truncate">{s.location_name ?? "(unnamed)"}</span>
              <span className="text-xs text-muted-foreground">{TYPE_LABELS[s.suggestion_type]}</span>
              <span
                className={cn(
                  "shrink-0 px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.08em] uppercase border",
                  STATUS_BADGES[s.status]
                )}
              >
                {s.status}
              </span>
            </p>
            <p className="text-xs text-muted-foreground mt-0.5" style={{ fontFamily: "var(--font-body)" }}>
              Submitted {formatDate(s.submitted_at)}
              {s.reviewed_at ? ` · Reviewed ${formatDate(s.reviewed_at)}` : ""}
            </p>
            {s.review_note && (
              <p className="text-xs text-muted-foreground mt-1 italic" style={{ fontFamily: "var(--font-body)" }}>
                Admin note: {s.review_note}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
