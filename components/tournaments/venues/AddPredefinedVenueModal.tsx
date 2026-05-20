// components/tournaments/venues/AddPredefinedVenueModal.tsx
"use client";
import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Search } from "lucide-react";

type LocOption = {
  id: number;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tournamentId: number;
  onCreated: () => void;
}

const INPUT =
  "w-full border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";

export default function AddPredefinedVenueModal({ open, onOpenChange, tournamentId, onCreated }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LocOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<number | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setError(null);
      return;
    }
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const id = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/locations?q=${encodeURIComponent(query)}&pageSize=20`);
        const json = await res.json();
        setResults(Array.isArray(json.rows) ? json.rows : []);
      } catch (e: any) {
        setError(e.message || "Search failed");
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(id);
  }, [open, query]);

  const pick = async (locationId: number) => {
    setSubmitting(locationId);
    setError(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/venues`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "predefined", locationId }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to add");
      onCreated();
      onOpenChange(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg rounded-none">
        <DialogHeader>
          <DialogTitle
            style={{ fontFamily: "var(--font-display)", textTransform: "uppercase", fontSize: "18px" }}
          >
            Add Predefined Venue
          </DialogTitle>
          <DialogDescription>
            Pick from the existing locations directory. To add a venue that isn't in the directory, use "Add Custom" instead.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            className={`${INPUT} pl-8`}
            placeholder="Search by name, city, or state"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          {loading && (
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-border border-t-primary" />
          )}
        </div>

        <ul className="max-h-72 overflow-y-auto border border-border divide-y divide-border">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                disabled={submitting != null}
                className="w-full text-left px-3 py-2 hover:bg-muted/60 transition-colors disabled:opacity-50"
                onClick={() => pick(r.id)}
              >
                <div className="text-sm font-medium">{r.name}</div>
                <div className="text-xs text-muted-foreground">
                  {[r.address, [r.city, r.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}
                </div>
              </button>
            </li>
          ))}
          {!loading && results.length === 0 && query.trim().length >= 2 && (
            <li className="px-3 py-2 text-xs text-muted-foreground">No matches.</li>
          )}
        </ul>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <DialogFooter>
          <button
            type="button"
            className="border border-border px-3 py-1.5 text-xs"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
