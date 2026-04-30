"use client";

import { useCallback, useRef, useState } from "react";
import { AddressAutofill } from "@mapbox/search-js-react";
import type { AddressAutofillRetrieveResponse } from "@mapbox/search-js-core";
import { AlertTriangle, MapPin } from "lucide-react";

const INPUT =
  "w-full border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";

export interface AddressFields {
  address: string;
  city: string;
  state: string;
  zip: string;
}

interface AddressAutofillInputProps {
  value: AddressFields;
  onAddressChange: (fields: AddressFields) => void;
  /** Show the street input as the address line (for display / edit) */
  streetInputValue?: string;
  onStreetInputChange?: (val: string) => void;
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
const DAILY_SESSION_LIMIT = 50;
const STORAGE_KEY = "mapbox_autofill_usage";

/** Returns today's session count from localStorage, resetting if the date changed. */
function getSessionCount(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return 0;
    const data = JSON.parse(raw);
    if (data.date !== new Date().toISOString().slice(0, 10)) return 0;
    return data.count ?? 0;
  } catch {
    return 0;
  }
}

/** Increment today's session count in localStorage. */
function incrementSessionCount(): number {
  const today = new Date().toISOString().slice(0, 10);
  const count = getSessionCount() + 1;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: today, count }));
  } catch { /* localStorage full or unavailable — ignore */ }
  return count;
}

export default function AddressAutofillInput({
  value,
  onAddressChange,
  streetInputValue,
  onStreetInputChange,
}: AddressAutofillInputProps) {
  const [resolved, setResolved] = useState(false);
  const [limitReached, setLimitReached] = useState(
    () => MAPBOX_TOKEN !== "" && getSessionCount() >= DAILY_SESSION_LIMIT
  );
  const cityRef = useRef<HTMLInputElement>(null);
  const stateRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);

  const handleRetrieve = useCallback(
    (res: AddressAutofillRetrieveResponse) => {
      const feat = res.features?.[0];
      if (!feat) return;
      const p = feat.properties;
      const fields: AddressFields = {
        address: p.address_line1 ?? p.feature_name ?? "",
        city: p.address_level2 ?? "",
        state: p.address_level1 ?? "",
        zip: p.postcode ?? "",
      };
      onAddressChange(fields);
      onStreetInputChange?.(fields.address);
      setResolved(true);
      const newCount = incrementSessionCount();
      if (newCount >= DAILY_SESSION_LIMIT) setLimitReached(true);
    },
    [onAddressChange, onStreetInputChange]
  );

  const handleStreetChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onStreetInputChange?.(e.target.value);
      // If user edits after resolving, clear the resolved state
      if (resolved) setResolved(false);
    },
    [onStreetInputChange, resolved]
  );

  // Read resolved address from hidden inputs after Mapbox autofills them
  const syncHiddenFields = useCallback(() => {
    const city = cityRef.current?.value ?? "";
    const state = stateRef.current?.value ?? "";
    const zip = zipRef.current?.value ?? "";
    if (city || state || zip) {
      onAddressChange({
        address: value.address,
        city,
        state,
        zip,
      });
    }
  }, [onAddressChange, value.address]);

  if (!MAPBOX_TOKEN || limitReached) {
    // Fallback: plain text inputs when Mapbox is not configured or daily limit reached
    return (
      <div className="space-y-2">
        {limitReached && (
          <div className="flex items-center gap-1.5 text-xs text-amber-600 px-1">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            <span>Address autocomplete paused — daily usage limit reached. Enter address manually.</span>
          </div>
        )}
        <input
          className={INPUT}
          placeholder="Street Address"
          value={streetInputValue ?? value.address}
          onChange={(e) => {
            onStreetInputChange?.(e.target.value);
            onAddressChange({ ...value, address: e.target.value });
          }}
        />
        <div className="grid grid-cols-3 gap-2">
          <input
            className={INPUT}
            placeholder="City"
            value={value.city}
            onChange={(e) =>
              onAddressChange({ ...value, city: e.target.value })
            }
          />
          <input
            className={INPUT}
            placeholder="State"
            value={value.state}
            maxLength={2}
            onChange={(e) =>
              onAddressChange({ ...value, state: e.target.value })
            }
          />
          <input
            className={INPUT}
            placeholder="ZIP"
            value={value.zip}
            maxLength={10}
            onChange={(e) =>
              onAddressChange({ ...value, zip: e.target.value })
            }
          />
        </div>
      </div>
    );
  }

  const summary = [value.address, value.city, value.state]
    .filter(Boolean)
    .join(", ");
  const summaryWithZip =
    summary + (value.zip ? ` ${value.zip}` : "");

  return (
    <div className="space-y-2">
      <form
        onSubmit={(e) => e.preventDefault()}
        onChange={syncHiddenFields}
      >
        <AddressAutofill
          accessToken={MAPBOX_TOKEN}
          options={{ country: "us" }}
          onRetrieve={handleRetrieve}
        >
          <input
            className={INPUT}
            placeholder="Start typing an address\u2026"
            autoComplete="address-line1"
            value={streetInputValue ?? value.address}
            onChange={handleStreetChange}
          />
        </AddressAutofill>
        {/* Hidden inputs for Mapbox to autofill via autoComplete attributes */}
        <input
          ref={cityRef}
          type="hidden"
          autoComplete="address-level2"
          tabIndex={-1}
        />
        <input
          ref={stateRef}
          type="hidden"
          autoComplete="address-level1"
          tabIndex={-1}
        />
        <input
          ref={zipRef}
          type="hidden"
          autoComplete="postal-code"
          tabIndex={-1}
        />
      </form>
      {/* Resolved address summary */}
      {resolved && summaryWithZip.trim() && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground px-1">
          <MapPin className="h-3 w-3 shrink-0" />
          <span>{summaryWithZip}</span>
        </div>
      )}
    </div>
  );
}
