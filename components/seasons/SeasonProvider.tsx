import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { usePermissions } from "@/lib/hooks/usePermissions";

export type Season = {
  id: number;
  name: string;
  year: number;
  season_type: "spring" | "summer" | "fall" | "winter";
  status: "draft" | "active" | "playoffs" | "completed" | "archived";
  maxrundiff: number | null;
  forfeit_run_diff: number | null;
  advances_to_playoffs: number | null;
  league_division_id: number;
  division_name: string;
  division_age_range: string | null;
  league_id: number;
  league_name: string;
  league_abbreviation: string | null;
  league_city: string | null;
  league_state: string | null;
  governing_body_id: number | null;
  governing_body_name: string | null;
  created_at: string;
};

type Ctx = {
  seasonId: number | null;
  season: Season | null;
  setSeason: React.Dispatch<React.SetStateAction<Season | null>>;
  loading: boolean;
  error: string | null;
  saving: boolean;
  save: () => Promise<void>;
  remove: () => Promise<void>;
  /** Whether the current user can edit this season (has division_admin, league_admin, or system admin) */
  canEdit: boolean;
};

const C = createContext<Ctx | undefined>(undefined);

export const useSeason = () => {
  const ctx = useContext(C);
  if (!ctx) throw new Error("useSeason must be used within SeasonProvider");
  return ctx;
};

export default function SeasonProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const seasonId = useMemo(() => {
    const raw = Array.isArray(router.query.seasonid) ? router.query.seasonid[0] : router.query.seasonid;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }, [router.query.seasonid]);

  const [season, setSeason] = useState<Season | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!router.isReady || !seasonId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/seasons/${seasonId}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.error) throw new Error(d.error);
        setSeason(d as Season);
      })
      .catch((e: any) => {
        if (!cancelled) setError(e.message ?? "Failed to load season");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => void (cancelled = true);
  }, [router.isReady, seasonId]);

  const permissions = usePermissions();
  const canEdit = useMemo(() => {
    if (permissions.loading || !season) return false;
    return permissions.canEditSeason(season.league_id, season.league_division_id);
  }, [permissions, season]);

  const save = async () => {
    if (!seasonId || !season) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/seasons/${seasonId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: season.name,
          year: season.year,
          season_type: season.season_type,
          status: season.status,
          maxrundiff: season.maxrundiff,
          forfeit_run_diff: season.forfeit_run_diff,
          advances_to_playoffs: season.advances_to_playoffs,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      setSeason((prev) => prev ? { ...prev, ...json } : prev);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!seasonId) return;
    if (!confirm("Delete this season? All games, standings, and brackets will be permanently removed.")) return;
    const res = await fetch(`/api/seasons/${seasonId}`, { method: "DELETE" });
    if (res.ok) {
      if (season?.league_id) {
        router.push(`/leagues/${season.league_id}/seasons/${season.year}-${season.season_type}`);
      } else {
        router.push("/leagues");
      }
    } else {
      const j = await res.json().catch(() => ({}));
      alert(j?.error || "Delete failed");
    }
  };

  return (
    <C.Provider value={{ seasonId, season, setSeason, loading, error, saving, save, remove, canEdit }}>
      {children}
    </C.Provider>
  );
}
