// components/tournaments/TournamentProvider.tsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { usePermissions } from "@/lib/hooks/usePermissions";
import type { Tournament, LookupRow } from "./types";

type Ctx = {
  tid: number | null;
  t: Tournament | null;
  setT: React.Dispatch<React.SetStateAction<Tournament | null>>;
  divisions: LookupRow[];
  statuses: LookupRow[];
  visibilities: LookupRow[];
  loading: boolean;
  error: string | null;
  saving: boolean;
  save: () => Promise<void>;
  remove: () => Promise<void>;
  canEdit: boolean;
};

const C = createContext<Ctx | undefined>(undefined);
export const useTournament = () => {
  const ctx = useContext(C);
  if (!ctx) throw new Error("useTournament must be used within TournamentProvider");
  return ctx;
};

export default function TournamentProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const tid = useMemo(() => {
    const raw = Array.isArray(router.query.tournamentid) ? router.query.tournamentid[0] : router.query.tournamentid;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }, [router.query.tournamentid]);

  const [t, setT] = useState<Tournament | null>(null);
  const [divisions, setDivisions] = useState<LookupRow[]>([]);
  const [statuses, setStatuses] = useState<LookupRow[]>([]);
  const [visibilities, setVisibilities] = useState<LookupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!router.isReady || !tid) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [lk, tr] = await Promise.all([
          fetch("/api/lookups").then((r) => r.json()),
          fetch(`/api/tournaments/${tid}`).then((r) => r.json()),
        ]);
        if (cancelled) return;
        setDivisions(Array.isArray(lk?.divisions) ? lk.divisions : []);
        setStatuses(Array.isArray(lk?.tournamentstatus) ? lk.tournamentstatus : lk?.statuses ?? []);
        setVisibilities(Array.isArray(lk?.tournamentvisibility) ? lk.tournamentvisibility : lk?.visibilities ?? []);
        setT(tr as Tournament);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => void (cancelled = true);
  }, [router.isReady, tid]);

  const permissions = usePermissions();
  const canEdit = useMemo(() => {
    if (permissions.loading || !tid) return false;
    return permissions.canEditTournament(tid);
  }, [permissions, tid]);

  const save = async () => {
    if (!tid || !t) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/tournaments/${tid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: t.name,
          city: t.city,
          state: t.state,
          year: t.year,
          maxrundiff: t.maxrundiff,
          forfeit_run_diff: t.forfeit_run_diff ?? null,
          advances_per_group: t.advances_per_group ?? null,
          num_pool_groups: t.num_pool_groups ?? null,
          divisionid: t.divisionid,
          statusid: t.statusid,
          visibilityid: t.visibilityid,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Save failed");
      setT(json as Tournament);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!tid) return;
    if (!confirm("Delete this tournament? This cannot be undone.")) return;
    const res = await fetch(`/api/tournaments/${tid}`, { method: "DELETE" });
    if (res.ok) router.push("/tournaments");
    else {
      const j = await res.json().catch(() => ({}));
      alert(j?.error || "Delete failed");
    }
  };

  return (
    <C.Provider value={{ tid, t, setT, divisions, statuses, visibilities, loading, error, saving, save, remove, canEdit }}>
      {children}
    </C.Provider>
  );
}
