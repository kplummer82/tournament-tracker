// pages/tournaments/[tournamentid]/scheduling.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TournamentProvider, { useTournament } from "@/components/tournaments/TournamentProvider";
import TournamentShell from "@/components/tournaments/TournamentShell";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  Plus,
  X,
  AlertTriangle,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Wand2,
  CheckCircle2,
  Trash2,
  Info,
  Ban,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/lib/hooks/useMediaQuery";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  normalizeTournamentScheduleConfig,
  assignDraftSlots,
  findSlotOverlaps,
  findTravelConflicts,
  type TournamentScheduleConfig,
  type DateRule,
  type TournamentTimeSlot,
  type TournamentTeam,
  type TravelContext,
} from "@/lib/tournament-schedule";

// ─── Types ─────────────────────────────────────────────────────────────────────

type VenueField = { id: number; name: string };
type Venue = { id: number; name: string; fields: VenueField[] };

type Team = { id: number; name: string; poolGroup: string | null };

/** A flat draft slot the workspace fills. id is stable per (date, index). */
interface DraftSlot {
  id: string;
  date: string;
  time: string;
  tournamentVenueId: number | null;
  field: string;
  poolGroup: string | null;
  maxGamesPerTeamOnDate?: number;
  home: Team | null;
  away: Team | null;
  blockedTeamIds: number[];
}

const UNASSIGNED = "__unassigned__";

const BTN =
  "inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] border transition-colors";
const FIELD =
  "border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:border-primary";
const SECTION_H =
  "text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-2";

// Mobile control styling (mirrors the season scheduler's mobile editor).
const MOBILE_INPUT =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary";
const MOBILE_ROW = "flex items-center justify-between gap-3";
const MOBILE_CTRL = "w-[62%] shrink-0";

const BLANK_CONFIG: TournamentScheduleConfig = {
  firstGameDate: "",
  lastGameDate: "",
  blackoutDates: [],
  dateRules: [],
  preventDuplicateMatchups: true,
  minGamesPerTeam: undefined,
  maxGamesPerTeam: undefined,
};

// ─── Date helpers ───────────────────────────────────────────────────────────────

function parseUTCDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function formatUTCDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function fmtDateLong(s: string): string {
  return parseUTCDate(s).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
function fmt12h(time: string): string {
  if (!time) return "—";
  const [hStr, mStr] = time.split(":");
  const h = parseInt(hStr, 10);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${mStr} ${suffix}`;
}
/** Minutes-since-midnight → "h:MM AM/PM" (caps display at end-of-day). */
function minutesToClock(mins: number): string {
  const m = Math.max(0, Math.min(mins, 23 * 60 + 59));
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return fmt12h(`${hh}:${mm}`);
}
function datesInRange(first: string, last: string, blackout: string[]): string[] {
  if (!first || !last || first > last) return [];
  const out: string[] = [];
  const end = parseUTCDate(last);
  const cursor = parseUTCDate(first);
  const black = new Set(blackout);
  while (cursor <= end) {
    const ds = formatUTCDate(cursor);
    if (!black.has(ds)) out.push(ds);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/**
 * Reconcile a config's dateRules against its date range minus blackouts. Existing
 * rules (and their slots) are preserved by date key; in-range dates without a rule
 * get an empty one; out-of-range/blacked-out dates are dropped. An empty/invalid
 * range yields no date cards. Pure — called synchronously inside the setConfig
 * updaters that change the range, so there's no effect/hydration race.
 */
function reconcileDateRules(c: TournamentScheduleConfig): TournamentScheduleConfig {
  const dates = datesInRange(c.firstGameDate, c.lastGameDate, c.blackoutDates);
  const existing = new Map(c.dateRules.map((r) => [r.date, r]));
  const next: DateRule[] = dates.map(
    (d) => existing.get(d) ?? { date: d, slots: [], maxGamesPerTeamOnDate: undefined },
  );
  const dateSet = new Set(dates);
  const same =
    next.length === c.dateRules.length && c.dateRules.every((r) => dateSet.has(r.date));
  return same ? c : { ...c, dateRules: next };
}

/** Distinct, sorted pool group labels actually used by the teams. */
function teamGroups(teams: Team[]): string[] {
  const set = new Set<string>();
  for (const t of teams) {
    const g = (t.poolGroup ?? "").trim();
    if (g) set.add(g);
  }
  return [...set].sort();
}

// ─── Draggable team chip ──────────────────────────────────────────────────────

function TeamChip({ team }: { team: Team }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `team-${team.id}`,
    data: { type: "team", team },
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        "inline-flex items-center rounded px-2.5 py-1 text-xs font-medium border cursor-grab active:cursor-grabbing select-none transition-colors bg-background border-border hover:border-primary hover:text-primary",
        isDragging && "opacity-0",
      )}
      style={{ transform: CSS.Transform.toString(transform), touchAction: "none" }}
    >
      {team.name}
    </div>
  );
}

function DraggingChip({ team }: { team: Team }) {
  return (
    <div className="inline-flex items-center rounded px-2.5 py-1 text-xs font-medium border border-primary bg-primary text-primary-foreground shadow-lg cursor-grabbing select-none">
      {team.name}
    </div>
  );
}

// ─── Slot position (droppable + draggable when filled) ──────────────────────────

function SlotPosition({
  slotId,
  position,
  team,
  onClear,
  conflicted,
  blockMode,
}: {
  slotId: string;
  position: "home" | "away";
  team: Team | null;
  onClear: () => void;
  conflicted?: boolean;
  blockMode?: boolean;
}) {
  const { isOver, setNodeRef: setDropRef } = useDroppable({
    id: `${slotId}__${position}`,
    data: { slotId, position },
  });
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    transform,
    isDragging,
  } = useDraggable({
    id: `slot-${slotId}-${position}`,
    data: { type: "slot-team", team, slotId, position },
    disabled: !team,
  });
  const mergedRef = useCallback(
    (node: HTMLDivElement | null) => {
      setDropRef(node);
      setDragRef(node);
    },
    [setDropRef, setDragRef],
  );

  if (team) {
    return (
      <div
        ref={mergedRef}
        {...attributes}
        {...listeners}
        className={cn(
          "flex items-center justify-between gap-1 w-full h-8 px-2.5 rounded border text-xs font-medium cursor-grab active:cursor-grabbing",
          conflicted
            ? "border-destructive/60 bg-destructive/5 text-destructive"
            : "border-primary/40 bg-primary/5 text-foreground",
          isDragging && "opacity-0",
        )}
        style={{ transform: CSS.Transform.toString(transform), touchAction: "none" }}
      >
        <span className="truncate min-w-0">{team.name}</span>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onClear}
          className="text-muted-foreground hover:text-foreground shrink-0 ml-1"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }
  return (
    <div
      ref={setDropRef}
      className={cn(
        "flex items-center justify-center w-full h-8 px-2.5 rounded border border-dashed text-[11px] text-muted-foreground transition-colors",
        isOver
          ? blockMode
            ? "border-destructive bg-destructive/5 text-destructive"
            : "border-primary bg-primary/5 text-primary"
          : "border-border/60",
      )}
    >
      {isOver && blockMode ? "Block here" : position === "home" ? "Home" : "Away"}
    </div>
  );
}

// ─── Body ───────────────────────────────────────────────────────────────────

// Styled native select for the mobile editor — native picker for good touch UX.
function MobileSelect({
  value,
  onChange,
  disabled,
  children,
}: {
  value: string | number;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={cn(MOBILE_INPUT, "appearance-none pr-9 disabled:opacity-50")}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
    </div>
  );
}

function SchedulingBody() {
  const { tid, t, canEdit, refreshSetup, loading } = useTournament();
  const isMobile = useIsMobile();
  // `mounted` guards against useIsMobile's SSR-false initial value (avoids a
  // hydration mismatch: server renders desktop, client may be mobile).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [editorSlotId, setEditorSlotId] = useState<string | null>(null);

  const [config, setConfig] = useState<TournamentScheduleConfig>(BLANK_CONFIG);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [slots, setSlots] = useState<DraftSlot[]>([]);
  const [rulesCollapsed, setRulesCollapsed] = useState(false);
  const [activeDrag, setActiveDrag] = useState<Team | null>(null);
  const [newBlackout, setNewBlackout] = useState("");
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [commitSuccess, setCommitSuccess] = useState(false);
  const [existing, setExisting] = useState<{ total: number; scored: number } | null>(null);
  const [savingRules, setSavingRules] = useState(false);
  const [rulesSaved, setRulesSaved] = useState(false);
  const [travel, setTravel] = useState<TravelContext | null>(null);
  const [mode, setMode] = useState<"assign" | "block">("assign");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Hydrate config from the persisted tournament record exactly once, after the
  // tournament has loaded. dateRules reconciliation is done synchronously inside the
  // date/blackout mutators (reconcileDateRules) rather than via an effect, so there
  // is no race that could wipe the loaded slots on hydration.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    if (loading) return; // wait until the tournament fetch settles
    hydratedRef.current = true;
    if (t?.schedule_config) {
      setConfig(normalizeTournamentScheduleConfig(t.schedule_config));
    }
  }, [loading, t?.schedule_config]);

  // Load venues + teams + existing pool-game counts.
  useEffect(() => {
    if (!tid) return;
    let cancelled = false;
    (async () => {
      try {
        const [venuesRes, teamsRes] = await Promise.all([
          fetch(`/api/tournaments/${tid}/venues`).then((r) => r.json()),
          fetch(`/api/tournaments/${tid}/teams`).then((r) => r.json()),
        ]);
        if (cancelled) return;
        setVenues(
          Array.isArray(venuesRes?.venues)
            ? venuesRes.venues.map((v: any) => ({
                id: Number(v.id),
                name: String(v.name ?? `Venue ${v.id}`),
                fields: Array.isArray(v.fields)
                  ? v.fields.map((f: any) => ({ id: Number(f.id), name: String(f.name) }))
                  : [],
              }))
            : [],
        );
        const teamList: Team[] = Array.isArray(teamsRes)
          ? teamsRes.map((r: any) => ({
              id: Number(r.id),
              name: String(r.name),
              poolGroup: r.pool_group != null ? String(r.pool_group) : null,
            }))
          : [];
        setTeams(teamList);
      } catch {
        /* leave empty; UI shows guidance */
      }
    })();
    return () => void (cancelled = true);
  }, [tid]);

  // Travel-time context (predefined-location drive times). Loaded separately so a
  // Mapbox/compute hiccup doesn't block venues/teams. Lazily computes + caches on
  // the server the first time a tournament with ≥2 mapped locations is opened.
  useEffect(() => {
    if (!tid) return;
    let cancelled = false;
    fetch(`/api/tournaments/${tid}/travel-times`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setTravel({
          venueLocation: d?.venueLocation ?? {},
          drivingMinutes: d?.drivingMinutes ?? {},
          changeoverMinutes: typeof d?.changeoverMinutes === "number" ? d.changeoverMinutes : 45,
        });
      })
      .catch(() => {
        if (!cancelled) setTravel(null);
      });
    return () => void (cancelled = true);
  }, [tid]);

  const refreshExisting = useCallback(() => {
    if (!tid) return;
    fetch(`/api/tournaments/${tid}/poolgames`)
      .then((r) => r.json())
      .then((d) => {
        const games: any[] = Array.isArray(d?.games) ? d.games : [];
        setExisting({
          total: games.length,
          scored: games.filter((g) => g.homescore != null || g.awayscore != null).length,
        });
      })
      .catch(() => setExisting(null));
  }, [tid]);
  useEffect(refreshExisting, [refreshExisting]);

  const groups = useMemo(() => teamGroups(teams), [teams]);

  // ── Config mutators ─────────────────────────────────────────────────────────
  const updateDateRule = useCallback((date: string, patch: Partial<DateRule>) => {
    setConfig((c) => ({
      ...c,
      dateRules: c.dateRules.map((r) => (r.date === date ? { ...r, ...patch } : r)),
    }));
  }, []);
  const addSlot = useCallback(
    (date: string) =>
      setConfig((c) => ({
        ...c,
        dateRules: c.dateRules.map((r) =>
          r.date === date
            ? {
                ...r,
                slots: [
                  ...r.slots,
                  { time: "10:00", tournamentVenueId: null, field: "", poolGroup: null },
                ],
              }
            : r,
        ),
      })),
    [],
  );
  const updateSlot = useCallback(
    (date: string, idx: number, patch: Partial<TournamentTimeSlot>) =>
      setConfig((c) => ({
        ...c,
        dateRules: c.dateRules.map((r) =>
          r.date === date
            ? { ...r, slots: r.slots.map((s, i) => (i === idx ? { ...s, ...patch } : s)) }
            : r,
        ),
      })),
    [],
  );
  const removeSlot = useCallback(
    (date: string, idx: number) =>
      setConfig((c) => ({
        ...c,
        dateRules: c.dateRules.map((r) =>
          r.date === date ? { ...r, slots: r.slots.filter((_, i) => i !== idx) } : r,
        ),
      })),
    [],
  );

  // Blocks live in config (so they persist + drive auto-fill) and flow to the
  // workspace slots via buildDraftSlots. A slot id is `${date}__${index}`.
  const parseSlotId = (slotId: string): { date: string; idx: number } | null => {
    const sep = slotId.lastIndexOf("__");
    if (sep === -1) return null;
    const date = slotId.slice(0, sep);
    const idx = Number(slotId.slice(sep + 2));
    return Number.isFinite(idx) ? { date, idx } : null;
  };
  const addBlock = useCallback((slotId: string, teamId: number) => {
    const parsed = parseSlotId(slotId);
    if (!parsed) return;
    setConfig((c) => ({
      ...c,
      dateRules: c.dateRules.map((r) =>
        r.date === parsed.date
          ? {
              ...r,
              slots: r.slots.map((s, i) =>
                i === parsed.idx
                  ? { ...s, blockedTeamIds: [...new Set([...(s.blockedTeamIds ?? []), teamId])] }
                  : s,
              ),
            }
          : r,
      ),
    }));
  }, []);
  const removeBlock = useCallback((slotId: string, teamId: number) => {
    const parsed = parseSlotId(slotId);
    if (!parsed) return;
    setConfig((c) => ({
      ...c,
      dateRules: c.dateRules.map((r) =>
        r.date === parsed.date
          ? {
              ...r,
              slots: r.slots.map((s, i) =>
                i === parsed.idx
                  ? { ...s, blockedTeamIds: (s.blockedTeamIds ?? []).filter((t) => t !== teamId) }
                  : s,
              ),
            }
          : r,
      ),
    }));
  }, []);
  const addBlackout = useCallback(() => {
    if (!newBlackout || config.blackoutDates.includes(newBlackout)) return;
    setConfig((c) =>
      reconcileDateRules({ ...c, blackoutDates: [...c.blackoutDates, newBlackout].sort() }),
    );
    setNewBlackout("");
  }, [newBlackout, config.blackoutDates]);

  const totalSlots = useMemo(
    () => config.dateRules.reduce((sum, r) => sum + r.slots.length, 0),
    [config.dateRules],
  );

  // Capacity hint: how many total games the matchup rules imply, summed across
  // pool groups (round-robin within each group). Min comes from min-games/team,
  // max from max-games/team — each capped by the distinct-pairing count when
  // "prevent duplicates" is on. Each game covers two team-slots, hence /2.
  const capacity = useMemo(() => {
    // Group sizes: real pool groups if present, else one group of all teams.
    const sizes =
      groups.length > 0
        ? groups.map(
            (g) => teams.filter((tm) => (tm.poolGroup ?? "").trim() === g).length,
          )
        : [teams.length];

    const min = config.minGamesPerTeam;
    const max = config.maxGamesPerTeam;
    const prevent = config.preventDuplicateMatchups;

    let minGames = 0;
    let maxGames = 0;
    const hasMin = min != null && min >= 1;
    const hasMax = max != null && max >= 1;

    for (const n of sizes) {
      if (n < 2) continue;
      const uniquePairs = (n * (n - 1)) / 2; // C(n,2) — full single round-robin
      if (hasMin) minGames += Math.ceil((n * min!) / 2);
      if (hasMax) {
        const perMax = Math.floor((n * max!) / 2);
        maxGames += prevent ? Math.min(perMax, uniquePairs) : perMax;
      }
    }
    // Min can't exceed max when both are set.
    if (hasMin && hasMax) minGames = Math.min(minGames, maxGames);

    return {
      hasMin,
      hasMax,
      minGames,
      maxGames,
      // Enough teams to compute anything meaningful?
      ready: teams.length >= 2 && (hasMin || hasMax),
    };
  }, [groups, teams, config.minGamesPerTeam, config.maxGamesPerTeam, config.preventDuplicateMatchups]);

  // Field double-bookings: slots on the same date/venue/field closer together
  // than the game duration. Empty unless a duration is set.
  const overlaps = useMemo(() => findSlotOverlaps(config), [config]);

  // When no duration is set but a venue+field is reused on the same date, overlap
  // detection can't run — nudge the user to enter a game duration to enable it.
  const couldOverlapNoDuration = useMemo(() => {
    if (config.gameDurationMinutes && config.gameDurationMinutes > 0) return false;
    for (const rule of config.dateRules) {
      const seen = new Set<string>();
      for (const s of rule.slots) {
        if (!s.field && s.tournamentVenueId == null) continue;
        const key = `${s.tournamentVenueId ?? "none"}|${(s.field ?? "").toLowerCase()}`;
        if (seen.has(key)) return true;
        seen.add(key);
      }
    }
    return false;
  }, [config.dateRules, config.gameDurationMinutes]);

  // Cross-location travel conflicts among the currently-assigned games: a team
  // whose consecutive same-day games at different predefined venues are too close
  // to drive between. Needs a duration + travel matrix; empty otherwise.
  const travelConflicts = useMemo(() => {
    if (!travel) return [];
    const games = slots
      .filter((s) => s.home && s.away)
      .map((s) => ({
        date: s.date,
        time: s.time,
        home: s.home!.id,
        away: s.away!.id,
        tournamentVenueId: s.tournamentVenueId,
      }));
    return findTravelConflicts(games, config.gameDurationMinutes, travel);
  }, [slots, config.gameDurationMinutes, travel]);

  // Manual block overrides: a filled position whose team is in that slot's blocklist.
  const blockViolations = useMemo(() => {
    const out: { slot: DraftSlot; teamId: number }[] = [];
    for (const s of slots) {
      if (s.blockedTeamIds.length === 0) continue;
      for (const tm of [s.home, s.away]) {
        if (tm && s.blockedTeamIds.includes(tm.id)) out.push({ slot: s, teamId: tm.id });
      }
    }
    return out;
  }, [slots]);

  // ── Build the workspace slots from config (preserving current assignments) ────
  const buildDraftSlots = useCallback((): DraftSlot[] => {
    const flat: DraftSlot[] = [];
    const black = new Set(config.blackoutDates);
    for (const rule of [...config.dateRules].sort((a, b) => a.date.localeCompare(b.date))) {
      if (!rule.date || black.has(rule.date)) continue;
      if (config.firstGameDate && rule.date < config.firstGameDate) continue;
      if (config.lastGameDate && rule.date > config.lastGameDate) continue;
      rule.slots.forEach((s, i) => {
        if (!s.time) return;
        flat.push({
          id: `${rule.date}__${i}`,
          date: rule.date,
          time: s.time,
          tournamentVenueId: s.tournamentVenueId ?? null,
          field: s.field ?? "",
          poolGroup: s.poolGroup ?? null,
          maxGamesPerTeamOnDate: rule.maxGamesPerTeamOnDate,
          home: null,
          away: null,
          blockedTeamIds: Array.isArray(s.blockedTeamIds) ? [...s.blockedTeamIds] : [],
        });
      });
    }
    return flat;
  }, [config]);

  // Regenerate the slot grid when config structure changes, carrying over
  // assignments by slot id.
  useEffect(() => {
    setSlots((prev) => {
      const byId = new Map(prev.map((s) => [s.id, s]));
      return buildDraftSlots().map((s) => {
        const old = byId.get(s.id);
        return old ? { ...s, home: old.home, away: old.away } : s;
      });
    });
  }, [buildDraftSlots]);

  // ── Persistence ───────────────────────────────────────────────────────────
  async function saveConfig() {
    if (!tid) return;
    await fetch(`/api/tournaments/${tid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schedule_config: config }),
    });
  }

  // Save the rules/slots config with button feedback.
  async function handleSaveRules() {
    if (!tid) return;
    setSavingRules(true);
    setRulesSaved(false);
    try {
      await saveConfig();
      setRulesSaved(true);
      setTimeout(() => setRulesSaved(false), 2500);
    } finally {
      setSavingRules(false);
    }
  }

  // ── Auto-fill: assign matchups directly to the draft slots by id ──────────────
  function handleAutoFill() {
    const genTeams: TournamentTeam[] = teams.map((t) => ({
      id: t.id,
      name: t.name,
      poolGroup: t.poolGroup,
    }));
    const teamById = new Map(teams.map((t) => [t.id, t]));
    setSlots((prev) => {
      const ordered = [...prev].sort((a, b) =>
        a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date),
      );
      const assignments = assignDraftSlots(
        config,
        genTeams,
        ordered.map((s) => ({
          id: s.id,
          date: s.date,
          poolGroup: s.poolGroup,
          maxGamesPerTeamOnDate: s.maxGamesPerTeamOnDate,
          time: s.time,
          tournamentVenueId: s.tournamentVenueId,
          blockedTeamIds: s.blockedTeamIds,
        })),
        travel ?? undefined,
      );
      const byId = new Map(assignments.map((a) => [a.slotId, a]));
      return prev.map((s) => {
        const a = byId.get(s.id);
        return a
          ? { ...s, home: teamById.get(a.home) ?? null, away: teamById.get(a.away) ?? null }
          : { ...s, home: null, away: null };
      });
    });
  }

  function clearAll() {
    setSlots((prev) => prev.map((s) => ({ ...s, home: null, away: null })));
  }

  function clearPosition(slotId: string, position: "home" | "away") {
    setSlots((prev) => prev.map((s) => (s.id === slotId ? { ...s, [position]: null } : s)));
  }

  // ── Drag handling ───────────────────────────────────────────────────────────
  function handleDragStart(e: DragStartEvent) {
    const d = e.active.data.current;
    const team = d?.type === "team" || d?.type === "slot-team" ? (d.team as Team) : null;
    setActiveDrag(team);
  }
  function handleDragEnd(e: DragEndEvent) {
    setActiveDrag(null);
    const { active, over } = e;
    if (!over) return;
    const overData = over.data.current as { slotId: string; position: "home" | "away" } | undefined;
    if (!overData?.slotId) return;
    const activeData = active.data.current;
    const team: Team | null =
      activeData?.type === "team" || activeData?.type === "slot-team"
        ? (activeData.team as Team)
        : null;
    if (!team) return;

    const { slotId, position } = overData;

    // Block mode: dropping a team on a slot blocks it from that game (whole slot).
    if (mode === "block") {
      addBlock(slotId, team.id);
      return;
    }

    const isMove = activeData?.type === "slot-team";
    const srcSlotId: string | null = isMove ? activeData.slotId : null;
    const srcPosition: "home" | "away" | null = isMove ? activeData.position : null;
    if (isMove && srcSlotId === slotId && srcPosition === position) return;

    setSlots((prev) => {
      const dest = prev.find((s) => s.id === slotId);
      if (!dest) return prev;
      // No doubleheaders beyond the per-date cap: block if team already at cap on that date.
      const onDate = prev.filter(
        (s) =>
          s.date === dest.date &&
          s.id !== slotId &&
          (srcSlotId == null || s.id !== srcSlotId) &&
          (s.home?.id === team.id || s.away?.id === team.id),
      ).length;
      const cap = dest.maxGamesPerTeamOnDate;
      if (cap != null && cap >= 1 && onDate >= cap) return prev;

      return prev.map((s) => {
        if (srcSlotId && s.id === srcSlotId) return { ...s, [srcPosition!]: null };
        if (s.id !== slotId) return s;
        const other = position === "home" ? s.away : s.home;
        if (other?.id === team.id) return s;
        return { ...s, [position]: team };
      });
    });
  }

  // ── Commit ──────────────────────────────────────────────────────────────────
  async function handleCommit() {
    const complete = slots.filter((s) => s.home && s.away);
    if (complete.length === 0 || !tid) return;
    setCommitting(true);
    setCommitError(null);
    setCommitSuccess(false);
    try {
      await saveConfig();
      const games = complete.map((s) => ({
        gamedate: s.date,
        gametime: s.time,
        home: s.home!.id,
        away: s.away!.id,
        tournament_venue_id: s.tournamentVenueId,
        field: s.field || "",
      }));
      const res = await fetch(`/api/tournaments/${tid}/auto-schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config, dry_run: false, games }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Commit failed");
      setCommitSuccess(true);
      refreshSetup();
      refreshExisting();
    } catch (e: any) {
      setCommitError(e.message);
    } finally {
      setCommitting(false);
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const teamGameCounts = useMemo<Record<number, number>>(() => {
    const counts: Record<number, number> = {};
    for (const t of teams) counts[t.id] = 0;
    for (const s of slots) {
      if (s.home) counts[s.home.id] = (counts[s.home.id] ?? 0) + 1;
      if (s.away) counts[s.away.id] = (counts[s.away.id] ?? 0) + 1;
    }
    return counts;
  }, [slots, teams]);

  const teamDateCounts = useMemo<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    for (const s of slots) {
      if (s.home) counts[`${s.home.id}__${s.date}`] = (counts[`${s.home.id}__${s.date}`] ?? 0) + 1;
      if (s.away) counts[`${s.away.id}__${s.date}`] = (counts[`${s.away.id}__${s.date}`] ?? 0) + 1;
    }
    return counts;
  }, [slots]);

  const assignedCount = slots.filter((s) => s.home && s.away).length;
  const partialCount = slots.filter((s) => (s.home || s.away) && !(s.home && s.away)).length;
  const venueName = (id: number | null) =>
    id == null ? "" : venues.find((v) => v.id === id)?.name ?? `Venue ${id}`;
  const teamName = (id: number) => teams.find((t) => t.id === id)?.name ?? `Team ${id}`;

  // Section keys: each real group, plus an "unassigned" bucket if any slot lacks a group.
  const sectionKeys = useMemo(() => {
    const keys = [...groups];
    if (slots.some((s) => !s.poolGroup)) keys.push(UNASSIGNED);
    if (keys.length === 0) keys.push(UNASSIGNED); // no groups at all → single section
    return keys;
  }, [groups, slots]);

  const scoreBlocked = (existing?.scored ?? 0) > 0;

  // ── Mobile helpers ──────────────────────────────────────────────────────────
  // Assign (or clear) a team into a slot position — the tap-editor equivalent of
  // the desktop drag assignment. Lives in workspace state (setSlots), not config.
  const assignPosition = useCallback(
    (slotId: string, position: "home" | "away", teamId: number | null) => {
      setSlots((prev) =>
        prev.map((s) => {
          if (s.id !== slotId) return s;
          if (teamId == null) return { ...s, [position]: null };
          const team = teams.find((tm) => tm.id === teamId) ?? null;
          const other = position === "home" ? s.away : s.home;
          if (other?.id === teamId) return s; // never the same team on both sides
          return { ...s, [position]: team };
        }),
      );
    },
    [teams],
  );
  const swapPositions = useCallback((slotId: string) => {
    setSlots((prev) =>
      prev.map((s) => (s.id === slotId ? { ...s, home: s.away, away: s.home } : s)),
    );
  }, []);
  // Append a slot to a date and open its editor. The new id is deterministic
  // (`${date}__${nextIdx}`), matching buildDraftSlots, so we can select it now.
  const addSlotAndEdit = useCallback(
    (date: string) => {
      const rule = config.dateRules.find((r) => r.date === date);
      const nextIdx = rule ? rule.slots.length : 0;
      addSlot(date);
      setEditorSlotId(`${date}__${nextIdx}`);
    },
    [config.dateRules, addSlot],
  );

  // ── Mobile render ─────────────────────────────────────────────────────────
  // Tap-based layout for phones: date-grouped cards + a slide-up editor. Date
  // range / rules are set on desktop; here operators fill slots and publish.
  if (mounted && isMobile) {
    const availableDates =
      config.firstGameDate && config.lastGameDate
        ? datesInRange(config.firstGameDate, config.lastGameDate, config.blackoutDates)
        : [];
    const slotsByDate = new Map<string, DraftSlot[]>();
    for (const s of slots) {
      const arr = slotsByDate.get(s.date) ?? [];
      arr.push(s);
      slotsByDate.set(s.date, arr);
    }
    const editorSlot = editorSlotId ? slots.find((s) => s.id === editorSlotId) ?? null : null;
    const editorParsed = editorSlot ? parseSlotId(editorSlot.id) : null;
    const editorVenue = editorSlot
      ? venues.find((v) => v.id === (editorSlot.tournamentVenueId ?? -1)) ?? null
      : null;
    const warnCount = overlaps.length + travelConflicts.length + blockViolations.length;

    return (
      <div style={{ fontFamily: "var(--font-body)" }} className="pb-28">
        <div className="flex items-center gap-2 mb-1">
          <CalendarDays className="h-4 w-4 text-primary" />
          <h1 className="text-sm font-semibold uppercase tracking-wide">Schedule Pool Play</h1>
        </div>

        {!canEdit && (
          <div className="p-3 my-3 bg-muted border border-border text-xs text-muted-foreground">
            You don&apos;t have edit access to this tournament.
          </div>
        )}

        <div className="flex items-center justify-between gap-2 mt-3 mb-3">
          <div className="text-sm">
            <span className="font-semibold text-foreground">{assignedCount}</span>
            <span className="text-muted-foreground">
              {" "}
              / {slots.length} game{slots.length !== 1 ? "s" : ""} ready
            </span>
          </div>
          {canEdit && slots.length > 0 && (
            <button
              type="button"
              onClick={handleAutoFill}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 border border-border rounded-full text-muted-foreground active:bg-muted/50"
            >
              <Wand2 className="h-3.5 w-3.5" /> Auto-fill
            </button>
          )}
        </div>

        {warnCount > 0 && (
          <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {warnCount} scheduling {warnCount === 1 ? "conflict" : "conflicts"} (overlap / travel /
            block) — review on a larger screen.
          </div>
        )}
        {scoreBlocked && (
          <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-muted border border-border rounded text-xs text-muted-foreground">
            <Info className="h-4 w-4 shrink-0" /> Some pool games already have scores — publish from a
            larger screen to avoid overwriting.
          </div>
        )}
        {commitError && (
          <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-destructive/10 border border-destructive/30 rounded text-xs text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {commitError}
          </div>
        )}
        {commitSuccess && (
          <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-green-500/10 border border-green-500/30 rounded text-xs font-medium text-green-700 dark:text-green-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" /> Published to the pool schedule.
          </div>
        )}

        {availableDates.length === 0 ? (
          <div className="py-12 px-4 text-center text-sm text-muted-foreground border border-dashed border-border rounded-lg">
            No dates set up yet. Set the tournament&apos;s date range and time slots on a larger
            screen, then come back here to assign teams and publish.
          </div>
        ) : (
          <div className="space-y-5">
            {availableDates.map((date) => {
              const dateSlots = slotsByDate.get(date) ?? [];
              return (
                <div key={date}>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-2">
                    {fmtDateLong(date)}
                  </div>
                  <div className="space-y-2">
                    {dateSlots.map((slot) => {
                      const complete = !!(slot.home && slot.away);
                      return (
                        <button
                          key={slot.id}
                          type="button"
                          onClick={() => setEditorSlotId(slot.id)}
                          className="w-full text-left flex items-center gap-3 p-3 rounded-lg border border-border bg-background active:bg-muted/40"
                        >
                          <span
                            className={cn(
                              "h-2.5 w-2.5 rounded-full shrink-0",
                              complete ? "bg-primary" : "bg-amber-500",
                            )}
                            aria-hidden
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-[13px] font-medium truncate">
                              {slot.home?.name ?? (
                                <span className="text-muted-foreground font-normal">Add team</span>
                              )}
                              <span className="text-muted-foreground font-normal"> vs </span>
                              {slot.away?.name ?? (
                                <span className="text-muted-foreground font-normal">Add team</span>
                              )}
                            </div>
                            <div className="text-[12px] text-muted-foreground truncate">
                              {fmt12h(slot.time)}
                              {slot.poolGroup ? ` · Pool ${slot.poolGroup}` : ""}
                            </div>
                            <div className="text-[11px] text-muted-foreground/80 truncate">
                              {slot.tournamentVenueId != null
                                ? `${venueName(slot.tournamentVenueId)}${slot.field ? " · " + slot.field : ""}`
                                : "No venue"}
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        </button>
                      );
                    })}
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => addSlotAndEdit(date)}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-dashed border-border text-sm font-semibold text-muted-foreground active:bg-muted/50"
                      >
                        <Plus className="h-4 w-4" /> Add game
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {canEdit && slots.length > 0 && (
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-center gap-2">
            <button
              type="button"
              onClick={handleAutoFill}
              className="flex-1 py-2.5 rounded-lg border border-border text-sm font-semibold text-muted-foreground active:bg-muted/50"
            >
              Auto-fill
            </button>
            <button
              type="button"
              onClick={handleCommit}
              disabled={committing || assignedCount === 0 || scoreBlocked}
              className="flex-1 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 active:opacity-90"
            >
              {committing ? "Publishing…" : `Publish ${assignedCount}`}
            </button>
          </div>
        )}

        <Sheet
          open={!!editorSlot}
          onOpenChange={(o) => {
            if (!o) setEditorSlotId(null);
          }}
        >
          {editorSlot && editorParsed && (
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Edit game — {fmtDateLong(editorSlot.date)}</SheetTitle>
              </SheetHeader>
              <SheetBody className="space-y-3.5">
                <div className={MOBILE_ROW}>
                  <span className="text-sm font-medium">Time</span>
                  <div className={MOBILE_CTRL}>
                    <input
                      type="time"
                      value={editorSlot.time}
                      onChange={(e) =>
                        updateSlot(editorParsed.date, editorParsed.idx, { time: e.target.value })
                      }
                      className={MOBILE_INPUT}
                    />
                  </div>
                </div>

                <div className={MOBILE_ROW}>
                  <span className="text-sm font-medium">Venue</span>
                  <div className={MOBILE_CTRL}>
                    <MobileSelect
                      value={editorSlot.tournamentVenueId ?? ""}
                      onChange={(e) => {
                        const raw = e.target.value;
                        updateSlot(editorParsed.date, editorParsed.idx, {
                          tournamentVenueId: raw ? Number(raw) : null,
                          field: "",
                        });
                      }}
                    >
                      <option value="">— Venue —</option>
                      {venues.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </MobileSelect>
                  </div>
                </div>
                <div className={MOBILE_ROW}>
                  <span className="text-sm font-medium">Field</span>
                  <div className={MOBILE_CTRL}>
                    <MobileSelect
                      value={editorSlot.field}
                      disabled={!editorVenue || editorVenue.fields.length === 0}
                      onChange={(e) =>
                        updateSlot(editorParsed.date, editorParsed.idx, { field: e.target.value })
                      }
                    >
                      <option value="">
                        {editorVenue && editorVenue.fields.length === 0
                          ? "— No fields —"
                          : "— Field —"}
                      </option>
                      {editorVenue?.fields.map((f) => (
                        <option key={f.id} value={f.name}>
                          {f.name}
                        </option>
                      ))}
                    </MobileSelect>
                  </div>
                </div>

                {groups.length > 0 && (
                  <div className={MOBILE_ROW}>
                    <span className="text-sm font-medium">Pool</span>
                    <div className={MOBILE_CTRL}>
                      <MobileSelect
                        value={editorSlot.poolGroup ?? ""}
                        onChange={(e) =>
                          updateSlot(editorParsed.date, editorParsed.idx, {
                            poolGroup: e.target.value || null,
                          })
                        }
                      >
                        <option value="">— Any pool —</option>
                        {groups.map((g) => (
                          <option key={g} value={g}>
                            Pool {g}
                          </option>
                        ))}
                      </MobileSelect>
                    </div>
                  </div>
                )}

                <div className={MOBILE_ROW}>
                  <span className="text-sm font-medium">Home</span>
                  <div className={MOBILE_CTRL}>
                    <MobileSelect
                      value={editorSlot.home?.id ?? ""}
                      onChange={(e) =>
                        assignPosition(
                          editorSlot.id,
                          "home",
                          e.target.value ? Number(e.target.value) : null,
                        )
                      }
                    >
                      <option value="">— Home —</option>
                      {teams
                        .filter((tm) => tm.id !== editorSlot.away?.id)
                        .map((tm) => (
                          <option key={tm.id} value={tm.id}>
                            {tm.name}
                          </option>
                        ))}
                    </MobileSelect>
                  </div>
                </div>
                <div className={MOBILE_ROW}>
                  <span className="text-sm font-medium">Away</span>
                  <div className={MOBILE_CTRL}>
                    <MobileSelect
                      value={editorSlot.away?.id ?? ""}
                      onChange={(e) =>
                        assignPosition(
                          editorSlot.id,
                          "away",
                          e.target.value ? Number(e.target.value) : null,
                        )
                      }
                    >
                      <option value="">— Away —</option>
                      {teams
                        .filter((tm) => tm.id !== editorSlot.home?.id)
                        .map((tm) => (
                          <option key={tm.id} value={tm.id}>
                            {tm.name}
                          </option>
                        ))}
                    </MobileSelect>
                  </div>
                </div>

                {editorSlot.home && editorSlot.away && (
                  <button
                    type="button"
                    onClick={() => swapPositions(editorSlot.id)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-border text-sm font-semibold text-muted-foreground active:bg-muted/50"
                  >
                    <RefreshCw className="h-4 w-4" /> Swap home &amp; away
                  </button>
                )}

                {canEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      removeSlot(editorParsed.date, editorParsed.idx);
                      setEditorSlotId(null);
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-destructive/40 text-sm font-semibold text-destructive active:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" /> Delete game
                  </button>
                )}
              </SheetBody>
              <SheetFooter>
                <button
                  type="button"
                  onClick={() => setEditorSlotId(null)}
                  className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold active:opacity-90"
                >
                  Done
                </button>
              </SheetFooter>
            </SheetContent>
          )}
        </Sheet>
      </div>
    );
  }

  // ── Render (desktop) ──────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "var(--font-body)" }}>
      <div className="flex items-center gap-2 mb-1">
        <CalendarDays className="h-4 w-4 text-primary" />
        <h1 className="text-sm font-semibold uppercase tracking-wide">Schedule Pool Play</h1>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Define time slots per date, then auto-fill or drag teams into each pool group&apos;s slots.
      </p>

      {!canEdit && (
        <div className="p-3 mb-4 bg-muted border border-border text-xs text-muted-foreground">
          You don&apos;t have edit access to this tournament.
        </div>
      )}

      {/* ── Rules panel ─────────────────────────────────────────────────────── */}
      <div className="border border-border mb-4">
        <button
          type="button"
          onClick={() => setRulesCollapsed((c) => !c)}
          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors"
        >
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em]">
            Scheduling Rules
          </span>
          {rulesCollapsed ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {!rulesCollapsed && (
          <div className="px-4 pb-4 pt-1 space-y-5 border-t border-border">
            {/* Date Range */}
            <div>
              <h4 className={SECTION_H}>Date Range</h4>
              <div className="flex items-center gap-3 flex-wrap">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] text-muted-foreground">First Game Date</span>
                  <input
                    type="date"
                    value={config.firstGameDate}
                    onChange={(e) =>
                      setConfig((c) => reconcileDateRules({ ...c, firstGameDate: e.target.value }))
                    }
                    className={FIELD}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] text-muted-foreground">Last Game Date</span>
                  <input
                    type="date"
                    value={config.lastGameDate}
                    onChange={(e) =>
                      setConfig((c) => reconcileDateRules({ ...c, lastGameDate: e.target.value }))
                    }
                    className={FIELD}
                  />
                </label>
              </div>
            </div>

            {/* Blackout Dates */}
            <div>
              <h4 className={SECTION_H}>Blackout Dates</h4>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {config.blackoutDates.map((d) => (
                  <span
                    key={d}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-muted border border-border text-[11px]"
                  >
                    {fmtDateLong(d)}
                    <button
                      type="button"
                      onClick={() =>
                        setConfig((c) =>
                          reconcileDateRules({
                            ...c,
                            blackoutDates: c.blackoutDates.filter((x) => x !== d),
                          }),
                        )
                      }
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={newBlackout}
                  onChange={(e) => setNewBlackout(e.target.value)}
                  className={FIELD}
                />
                <button
                  type="button"
                  onClick={addBlackout}
                  className={cn(
                    BTN,
                    "border-border text-muted-foreground hover:border-primary hover:text-primary",
                  )}
                >
                  <Plus className="h-3 w-3" /> Add
                </button>
              </div>
            </div>

            {/* Matchup Rules */}
            <div>
              <h4 className={SECTION_H}>Matchup Rules</h4>
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.preventDuplicateMatchups}
                    onChange={(e) =>
                      setConfig((c) => ({ ...c, preventDuplicateMatchups: e.target.checked }))
                    }
                    className="accent-primary"
                  />
                  Prevent two teams from playing twice in pool play
                </label>
                <div className="flex items-center gap-4 flex-wrap">
                  <label className="flex items-center gap-2 text-xs">
                    <span>Min games per team</span>
                    <input
                      type="number"
                      min={0}
                      placeholder="—"
                      value={config.minGamesPerTeam ?? ""}
                      onChange={(e) =>
                        setConfig((c) => ({
                          ...c,
                          minGamesPerTeam:
                            e.target.value === "" ? undefined : Number(e.target.value),
                        }))
                      }
                      className={cn(FIELD, "w-16")}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <span>Max games per team</span>
                    <input
                      type="number"
                      min={1}
                      placeholder="—"
                      value={config.maxGamesPerTeam ?? ""}
                      onChange={(e) =>
                        setConfig((c) => ({
                          ...c,
                          maxGamesPerTeam:
                            e.target.value === "" ? undefined : Number(e.target.value),
                        }))
                      }
                      className={cn(FIELD, "w-16")}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <span>Game duration (min)</span>
                    <input
                      type="number"
                      min={1}
                      step={5}
                      placeholder="—"
                      value={config.gameDurationMinutes ?? ""}
                      onChange={(e) =>
                        setConfig((c) => ({
                          ...c,
                          gameDurationMinutes:
                            e.target.value === "" ? undefined : Number(e.target.value),
                        }))
                      }
                      className={cn(FIELD, "w-20")}
                      title="Max length of a game — used to flag overlapping slots on the same field"
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* Time slots by date */}
            <div>
              <h4 className={SECTION_H}>Time Slots by Date</h4>
              {config.dateRules.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Set a first and last game date to define time slots.
                </p>
              ) : (
                <div className="space-y-2">
                  {config.dateRules.map((rule) => (
                    <div key={rule.date} className="border border-border p-3">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <span className="text-xs font-semibold">{fmtDateLong(rule.date)}</span>
                        <label className="flex items-center gap-1.5">
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                            Max games/team this date
                          </span>
                          <input
                            type="number"
                            min={1}
                            placeholder="No limit"
                            value={rule.maxGamesPerTeamOnDate ?? ""}
                            onChange={(e) =>
                              updateDateRule(rule.date, {
                                maxGamesPerTeamOnDate:
                                  e.target.value === ""
                                    ? undefined
                                    : Math.max(1, Number(e.target.value) || 1),
                              })
                            }
                            className={cn(FIELD, "w-24")}
                            title="Leave blank for no per-date limit"
                          />
                        </label>
                      </div>
                      <div className="mt-3 space-y-2">
                        {rule.slots.map((slot, i) => {
                          const venue = venues.find((v) => v.id === slot.tournamentVenueId);
                          return (
                            <div key={i} className="flex items-center gap-2 flex-wrap">
                              <input
                                type="time"
                                value={slot.time}
                                onChange={(e) => updateSlot(rule.date, i, { time: e.target.value })}
                                className={cn(FIELD, "w-[110px]")}
                              />
                              <select
                                value={slot.tournamentVenueId ?? ""}
                                onChange={(e) =>
                                  updateSlot(rule.date, i, {
                                    tournamentVenueId: e.target.value
                                      ? Number(e.target.value)
                                      : null,
                                    field: "",
                                  })
                                }
                                className={cn(FIELD, "min-w-[130px]")}
                              >
                                <option value="">— Venue —</option>
                                {venues.map((v) => (
                                  <option key={v.id} value={v.id}>
                                    {v.name}
                                  </option>
                                ))}
                              </select>
                              <select
                                value={slot.field}
                                onChange={(e) =>
                                  updateSlot(rule.date, i, { field: e.target.value })
                                }
                                disabled={!venue || venue.fields.length === 0}
                                className={cn(FIELD, "min-w-[110px] disabled:opacity-50")}
                              >
                                <option value="">— Field —</option>
                                {venue?.fields.map((f) => (
                                  <option key={f.id} value={f.name}>
                                    {f.name}
                                  </option>
                                ))}
                              </select>
                              {groups.length > 0 && (
                                <select
                                  value={slot.poolGroup ?? ""}
                                  onChange={(e) =>
                                    updateSlot(rule.date, i, {
                                      poolGroup: e.target.value || null,
                                    })
                                  }
                                  className={cn(FIELD, "min-w-[90px]")}
                                  title="Pool group that plays this slot"
                                >
                                  <option value="">Any group</option>
                                  {groups.map((g) => (
                                    <option key={g} value={g}>
                                      Group {g}
                                    </option>
                                  ))}
                                </select>
                              )}
                              <button
                                type="button"
                                onClick={() => removeSlot(rule.date, i)}
                                className="text-muted-foreground hover:text-destructive transition-colors"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => addSlot(rule.date)}
                          className={cn(
                            BTN,
                            "border-border text-muted-foreground hover:border-primary hover:text-primary text-[10px] px-2 py-0.5",
                          )}
                        >
                          <Plus className="h-3 w-3" /> Slot
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[10px] text-muted-foreground">
                {totalSlots} slot{totalSlots !== 1 ? "s" : ""} defined
              </span>
              <button
                type="button"
                onClick={handleSaveRules}
                disabled={!canEdit || savingRules}
                className={cn(
                  BTN,
                  rulesSaved
                    ? "border-green-500/50 text-green-700 dark:text-green-400"
                    : "border-border text-muted-foreground hover:border-foreground hover:text-foreground",
                  "disabled:opacity-50",
                )}
              >
                {savingRules ? "Saving…" : rulesSaved ? "Saved ✓" : "Save Rules & Slots"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Capacity hint ───────────────────────────────────────────────────── */}
      {capacity.ready && (capacity.hasMin || capacity.hasMax) && (
        (() => {
          const tooFew = capacity.hasMin && totalSlots < capacity.minGames;
          const tooMany = capacity.hasMax && totalSlots > capacity.maxGames;
          const target =
            capacity.hasMin && capacity.hasMax
              ? capacity.minGames === capacity.maxGames
                ? `${capacity.minGames}`
                : `${capacity.minGames}–${capacity.maxGames}`
              : capacity.hasMin
                ? `at least ${capacity.minGames}`
                : `up to ${capacity.maxGames}`;
          const tone = tooFew
            ? "border-amber-400/40 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300"
            : tooMany
              ? "border-amber-400/40 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300"
              : "border-border bg-muted/30 text-muted-foreground";
          return (
            <div className={cn("flex items-start gap-2 p-3 mb-3 border text-xs", tone)}>
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                Your matchup rules need <strong>{target}</strong> total game
                {target === "1" ? "" : "s"}
                {groups.length > 0 ? " across all pool groups" : ""}. You&apos;ve defined{" "}
                <strong>{totalSlots}</strong> slot{totalSlots !== 1 ? "s" : ""}.
                {tooFew && ` Add at least ${capacity.minGames - totalSlots} more to fit the minimum.`}
                {tooMany &&
                  ` That's ${totalSlots - capacity.maxGames} more than the maximum — some slots will stay empty.`}
                {!tooFew && !tooMany && " That fits."}
              </span>
            </div>
          );
        })()
      )}

      {/* ── Nudge: set a game duration to enable overlap detection ──────────── */}
      {couldOverlapNoDuration && (
        <div className="flex items-start gap-2 p-3 mb-3 border border-border bg-muted/30 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            You have multiple slots on the same field. Set a{" "}
            <strong>Game duration</strong> above to check for overlapping start times.
          </span>
        </div>
      )}

      {/* ── Field overlap warning ───────────────────────────────────────────── */}
      {overlaps.length > 0 && (
        <div className="border border-amber-400/40 bg-amber-50 dark:bg-amber-950/20 p-3 mb-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400 mb-1.5 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Overlapping slots ({config.gameDurationMinutes}-min games)
          </p>
          <ul className="space-y-0.5">
            {overlaps.slice(0, 6).map((o, i) => (
              <li key={i} className="text-xs text-amber-800 dark:text-amber-300">
                {fmtDateLong(o.date)} — {[venueName(o.venueId), o.field].filter(Boolean).join(" / ") || "field"}:{" "}
                {fmt12h(o.timeA)} &amp; {fmt12h(o.timeB)} overlap.
              </li>
            ))}
            {overlaps.length > 6 && (
              <li className="text-xs text-amber-800 dark:text-amber-300">
                +{overlaps.length - 6} more overlapping pair{overlaps.length - 6 !== 1 ? "s" : ""}.
              </li>
            )}
          </ul>
        </div>
      )}

      {/* ── Cross-location travel-time warning ──────────────────────────────── */}
      {travelConflicts.length > 0 && (
        <div className="border border-amber-400/40 bg-amber-50 dark:bg-amber-950/20 p-3 mb-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400 mb-1.5 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Not enough travel time between venues
          </p>
          <ul className="space-y-0.5">
            {travelConflicts.slice(0, 6).map((c, i) => (
              <li key={i} className="text-xs text-amber-800 dark:text-amber-300">
                {teamName(c.teamId)} — {fmtDateLong(c.date)}: {venueName(c.fromVenueId)}{" "}
                {fmt12h(c.game1Time)} → {venueName(c.toVenueId)} {fmt12h(c.game2Time)} (can&apos;t
                arrive until {minutesToClock(c.needMinutes)}).
              </li>
            ))}
            {travelConflicts.length > 6 && (
              <li className="text-xs text-amber-800 dark:text-amber-300">
                +{travelConflicts.length - 6} more travel conflict
                {travelConflicts.length - 6 !== 1 ? "s" : ""}.
              </li>
            )}
          </ul>
        </div>
      )}

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-4 text-[11px] flex-wrap">
          {/* Assign / Block mode toggle */}
          <div className="inline-flex border border-border rounded overflow-hidden">
            {(["assign", "block"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  "px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] transition-colors",
                  mode === m
                    ? m === "block"
                      ? "bg-destructive/15 text-destructive"
                      : "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m === "assign" ? "Assign" : "Block"}
              </button>
            ))}
          </div>
          <span className="text-muted-foreground">
            <span className="font-semibold text-foreground">{assignedCount}</span>/{slots.length}{" "}
            slots filled
          </span>
          {partialCount > 0 && (
            <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> {partialCount} partial
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAutoFill}
            disabled={!canEdit || slots.length === 0 || teams.length < 2}
            className={cn(
              BTN,
              "border-border text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-50",
            )}
          >
            <Wand2 className="h-3.5 w-3.5" /> Auto-Fill
          </button>
          <button
            type="button"
            onClick={clearAll}
            disabled={!canEdit || assignedCount + partialCount === 0}
            className={cn(
              BTN,
              "border-border text-muted-foreground hover:border-destructive hover:text-destructive disabled:opacity-50",
            )}
          >
            <Trash2 className="h-3.5 w-3.5" /> Clear
          </button>
          <button
            type="button"
            onClick={handleCommit}
            disabled={!canEdit || committing || assignedCount === 0 || scoreBlocked}
            className={cn(
              BTN,
              "bg-primary text-primary-foreground border-primary hover:opacity-90 disabled:opacity-50",
            )}
          >
            {committing ? "Saving…" : `Save ${assignedCount} Game${assignedCount !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>

      {/* Block-mode hint */}
      {mode === "block" && (
        <div className="flex items-start gap-2 p-3 mb-3 border border-destructive/30 bg-destructive/5 text-xs text-destructive">
          <Ban className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            Block mode: drag a team onto a slot to keep it from being scheduled there. Auto-fill
            will avoid blocked teams. Switch back to <strong>Assign</strong> to place teams.
          </span>
        </div>
      )}

      {/* Block-override violation warning */}
      {blockViolations.length > 0 && (
        <div className="border border-amber-400/40 bg-amber-50 dark:bg-amber-950/20 p-3 mb-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400 mb-1.5 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Blocked teams assigned anyway
          </p>
          <ul className="space-y-0.5">
            {blockViolations.slice(0, 6).map((v, i) => (
              <li key={i} className="text-xs text-amber-800 dark:text-amber-300">
                {teamName(v.teamId)} is blocked from {fmtDateLong(v.slot.date)} {fmt12h(v.slot.time)}
                {" — "}
                {[venueName(v.slot.tournamentVenueId), v.slot.field].filter(Boolean).join(" / ") ||
                  "this slot"}{" "}
                but is assigned there.
              </li>
            ))}
            {blockViolations.length > 6 && (
              <li className="text-xs text-amber-800 dark:text-amber-300">
                +{blockViolations.length - 6} more.
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Replace / score notices */}
      {scoreBlocked ? (
        <div className="border border-destructive/40 bg-destructive/10 p-3 mb-3 text-xs text-destructive">
          {existing!.scored} existing pool game{existing!.scored !== 1 ? "s have" : " has"} a score.
          Clear those scores before regenerating the schedule.
        </div>
      ) : (existing?.total ?? 0) > 0 ? (
        <div className="border border-amber-400/40 bg-amber-50 dark:bg-amber-950/20 p-3 mb-3 text-xs text-amber-800 dark:text-amber-300">
          Saving replaces all {existing!.total} existing pool game
          {existing!.total !== 1 ? "s" : ""}. Bracket games are not affected.
        </div>
      ) : null}

      {commitError && (
        <div className="flex items-start gap-2 p-3 mb-3 bg-destructive/10 border border-destructive/30 text-destructive text-xs">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          {commitError}
        </div>
      )}
      {commitSuccess && (
        <div className="flex items-start gap-2 p-3 mb-3 bg-green-500/10 border border-green-500/30 text-green-700 dark:text-green-400 text-xs">
          <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          Pool schedule saved.
        </div>
      )}

      {/* ── Workspace ───────────────────────────────────────────────────────── */}
      {slots.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border">
          <CalendarDays className="h-8 w-8 text-muted-foreground mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No slots defined yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Set a date range and add time slots in Scheduling Rules above.
          </p>
        </div>
      ) : (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="space-y-8">
            {sectionKeys.map((gk) => {
              const sectionTeams =
                gk === UNASSIGNED
                  ? teams // unassigned/no-group section can use any team
                  : teams.filter((t) => (t.poolGroup ?? "").trim() === gk);
              const sectionSlots = slots.filter((s) =>
                gk === UNASSIGNED ? !s.poolGroup : s.poolGroup === gk,
              );
              if (sectionSlots.length === 0 && gk !== UNASSIGNED) return null;

              const slotsByDate = new Map<string, DraftSlot[]>();
              for (const s of sectionSlots) {
                const arr = slotsByDate.get(s.date) ?? [];
                arr.push(s);
                slotsByDate.set(s.date, arr);
              }
              const sortedDates = [...slotsByDate.keys()].sort();

              return (
                <section key={gk}>
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] mb-3 border-b border-border pb-1.5">
                    {gk === UNASSIGNED ? (groups.length > 0 ? "Any Group" : "All Teams") : `Group ${gk}`}
                  </h3>
                  <div className="flex gap-4 items-start">
                    {/* Team rail */}
                    <div className="w-48 shrink-0 border border-border rounded sticky top-4">
                      <div className="px-3 py-2 border-b border-border bg-muted/30">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                          Teams
                        </span>
                      </div>
                      <div className="p-2 space-y-1.5">
                        {sectionTeams.length === 0 ? (
                          <p className="text-[10px] text-muted-foreground px-1 py-2">
                            No teams in this group.
                          </p>
                        ) : (
                          sectionTeams.map((tm) => {
                            const count = teamGameCounts[tm.id] ?? 0;
                            const min = config.minGamesPerTeam;
                            const max = config.maxGamesPerTeam;
                            const color =
                              count === 0
                                ? "text-destructive"
                                : max != null && count > max
                                  ? "text-destructive"
                                  : min != null && count < min
                                    ? "text-amber-600 dark:text-amber-400"
                                    : "text-green-600 dark:text-green-400";
                            return (
                              <div key={tm.id} className="flex items-center justify-between gap-1">
                                <TeamChip team={tm} />
                                <span
                                  className={cn(
                                    "text-[11px] font-semibold tabular-nums shrink-0",
                                    color,
                                  )}
                                >
                                  {count}g
                                </span>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>

                    {/* Slot grid — one bordered table panel per date */}
                    <div className="flex-1 min-w-0 space-y-4">
                      {sortedDates.map((date) => (
                        <div key={date} className="border border-border rounded overflow-hidden">
                          <div className="px-3 py-2 border-b border-border bg-muted/30 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                            {fmtDateLong(date)}
                          </div>
                          <div className="divide-y divide-border/60">
                            {slotsByDate.get(date)!.map((slot) => {
                              const dateCap =
                                slot.maxGamesPerTeamOnDate != null &&
                                slot.maxGamesPerTeamOnDate >= 1
                                  ? slot.maxGamesPerTeamOnDate
                                  : Infinity;
                              const homeBlocked =
                                slot.home != null && slot.blockedTeamIds.includes(slot.home.id);
                              const awayBlocked =
                                slot.away != null && slot.blockedTeamIds.includes(slot.away.id);
                              const homeConflict =
                                homeBlocked ||
                                (slot.home
                                  ? (teamDateCounts[`${slot.home.id}__${date}`] ?? 0) > dateCap
                                  : false);
                              const awayConflict =
                                awayBlocked ||
                                (slot.away
                                  ? (teamDateCounts[`${slot.away.id}__${date}`] ?? 0) > dateCap
                                  : false);
                              return (
                                <div key={slot.id} className="px-3 py-1.5">
                                  <div className="grid grid-cols-[1fr_auto_1fr_auto_minmax(0,1.4fr)] items-center gap-x-3">
                                    <SlotPosition
                                      slotId={slot.id}
                                      position="home"
                                      team={slot.home}
                                      onClear={() => clearPosition(slot.id, "home")}
                                      conflicted={homeConflict}
                                      blockMode={mode === "block"}
                                    />
                                    <span className="text-[10px] text-muted-foreground font-bold px-0.5">
                                      vs
                                    </span>
                                    <SlotPosition
                                      slotId={slot.id}
                                      position="away"
                                      team={slot.away}
                                      onClear={() => clearPosition(slot.id, "away")}
                                      conflicted={awayConflict}
                                      blockMode={mode === "block"}
                                    />
                                    <span className="text-[11px] text-muted-foreground text-right shrink-0 tabular-nums">
                                      {fmt12h(slot.time)}
                                    </span>
                                    <span className="text-[11px] text-muted-foreground truncate min-w-0">
                                      {[venueName(slot.tournamentVenueId), slot.field]
                                        .filter(Boolean)
                                        .join(" — ")}
                                    </span>
                                  </div>
                                  {slot.blockedTeamIds.length > 0 && (
                                    <div className="flex items-center gap-1.5 flex-wrap mt-1.5 pl-0.5">
                                      <Ban className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                                      {slot.blockedTeamIds.map((teamId) => (
                                        <span
                                          key={teamId}
                                          className="inline-flex items-center gap-1 rounded border border-dashed border-muted-foreground/40 px-1.5 py-0.5 text-[10px] text-muted-foreground line-through"
                                          title="Blocked from this slot"
                                        >
                                          {teamName(teamId)}
                                          <button
                                            type="button"
                                            onClick={() => removeBlock(slot.id, teamId)}
                                            className="hover:text-foreground no-underline"
                                          >
                                            <X className="h-3 w-3" />
                                          </button>
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              );
            })}
          </div>

          <DragOverlay>{activeDrag ? <DraggingChip team={activeDrag} /> : null}</DragOverlay>
        </DndContext>
      )}
    </div>
  );
}

export default function SchedulingPage() {
  return (
    <TournamentProvider>
      <TournamentShell tab="scheduling">
        <SchedulingBody />
      </TournamentShell>
    </TournamentProvider>
  );
}
