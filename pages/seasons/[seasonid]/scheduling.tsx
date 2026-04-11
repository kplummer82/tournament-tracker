// pages/seasons/[seasonid]/scheduling.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import SeasonProvider, { useSeason } from "@/components/seasons/SeasonProvider";
import SeasonShell from "@/components/seasons/SeasonShell";
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
  Plus, X, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2,
  Wand2, CalendarCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ScheduleConfig, DayRule, Team, GameTimeSlot } from "@/lib/auto-schedule";
import { buildSlots, generateSchedule, normalizeScheduleConfig } from "@/lib/auto-schedule";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface DraftSlot {
  id: string;           // unique: `${date}__${time}__${fieldKey}`
  date: string;         // "YYYY-MM-DD"
  time: string;         // "HH:MM"
  fieldName: string;
  fieldLocation: string;
  home: Team | null;
  away: Team | null;
}

const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function fmt12h(time: string): string {
  const [hStr, mStr] = time.split(':');
  const h = parseInt(hStr, 10);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${mStr} ${suffix}`;
}

const BLANK_CONFIG: ScheduleConfig = {
  firstGameDate: '',
  lastGameDate: '',
  blackoutDates: [],
  dayRules: [],
  fields: [],
  maxRepeatMatchups: 1,
  targetGamesPerTeam: undefined,
  noBackToBackMatchups: false,
  allowDoubleHeaders: false,
};

function emptyDayRule(dow: DayRule['dayOfWeek']): DayRule {
  return { dayOfWeek: dow, maxGamesPerDay: 2, gameSlots: [{ time: '10:00', fieldName: '', fieldLocation: '' }], maxGamesPerTeamOnDay: 1 };
}

const BTN = "inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] border transition-colors";
const FIELD_INPUT = "border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:border-primary";

// ─── Team chip (draggable) ──────────────────────────────────────────────────────

function TeamChip({ team }: { team: Team }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `team-${team.id}`,
    data: { type: 'team', team },
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        "inline-flex items-center px-2 py-0.5 text-[11px] font-medium border cursor-grab active:cursor-grabbing select-none transition-colors bg-background border-border hover:border-primary hover:text-primary",
        isDragging && "opacity-0"
      )}
      style={{ transform: CSS.Transform.toString(transform), touchAction: 'none' }}
    >
      {team.name}
    </div>
  );
}

function DraggingChip({ team }: { team: Team }) {
  return (
    <div className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium border border-primary bg-primary text-primary-foreground shadow-lg cursor-grabbing select-none">
      {team.name}
    </div>
  );
}

// ─── Slot position (droppable + shows assigned team) ───────────────────────────

function SlotPosition({
  slotId,
  position,
  team,
  onClear,
  conflicted,
}: {
  slotId: string;
  position: 'home' | 'away';
  team: Team | null;
  onClear: () => void;
  conflicted?: boolean;
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
    data: { type: 'slot-team', team, slotId, position },
    disabled: !team,
  });

  const mergedRef = useCallback(
    (node: HTMLDivElement | null) => {
      setDropRef(node);
      setDragRef(node);
    },
    [setDropRef, setDragRef]
  );

  if (team) {
    return (
      <div
        ref={mergedRef}
        {...attributes}
        {...listeners}
        className={cn(
          "flex items-center justify-between gap-1 px-2 py-0.5 border text-[11px] font-medium min-w-[100px] cursor-grab active:cursor-grabbing",
          conflicted
            ? "border-destructive/60 bg-destructive/5 text-destructive"
            : "border-primary/40 bg-primary/5 text-foreground",
          isDragging && "opacity-0"
        )}
        style={{ transform: CSS.Transform.toString(transform), touchAction: 'none' }}
      >
        <span className="truncate max-w-[80px]">{team.name}</span>
        <button
          type="button"
          onPointerDown={e => e.stopPropagation()}
          onClick={onClear}
          className="text-muted-foreground hover:text-foreground shrink-0 ml-1"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={setDropRef}
      className={cn(
        "flex items-center justify-center px-2 py-0.5 border border-dashed text-[10px] text-muted-foreground min-w-[100px] transition-colors",
        isOver ? "border-primary bg-primary/5 text-primary" : "border-border/60"
      )}
    >
      {position === 'home' ? 'Home' : 'Away'}
    </div>
  );
}

// ─── Scheduling Rules Panel ─────────────────────────────────────────────────────

function SchedulingRules({
  config,
  setConfig,
  onSave,
  onGenerate,
  saving,
}: {
  config: ScheduleConfig;
  setConfig: (c: ScheduleConfig) => void;
  onSave: () => Promise<void>;
  onGenerate: () => void;
  saving: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [newBlackout, setNewBlackout] = useState('');

  function isDayEnabled(dow: number) { return config.dayRules.some(r => r.dayOfWeek === dow); }
  function getDayRule(dow: number): DayRule | undefined { return config.dayRules.find(r => r.dayOfWeek === dow); }
  function toggleDay(dow: DayRule['dayOfWeek']) {
    if (isDayEnabled(dow)) {
      setConfig({ ...config, dayRules: config.dayRules.filter(r => r.dayOfWeek !== dow) });
    } else {
      setConfig({ ...config, dayRules: [...config.dayRules, emptyDayRule(dow)].sort((a, b) => a.dayOfWeek - b.dayOfWeek) });
    }
  }
  function updateDayRule(dow: number, patch: Partial<DayRule>) {
    setConfig({ ...config, dayRules: config.dayRules.map(r => r.dayOfWeek === dow ? { ...r, ...patch } : r) });
  }
  function addSlotToDay(dow: number) {
    const existing = getDayRule(dow)?.gameSlots ?? [];
    const next = [...existing, { time: '12:00', fieldName: '', fieldLocation: '' }];
    updateDayRule(dow, { gameSlots: next, maxGamesPerDay: next.length });
  }
  function updateSlotOnDay(dow: number, idx: number, patch: Partial<GameTimeSlot>) {
    const rule = getDayRule(dow);
    if (!rule) return;
    updateDayRule(dow, { gameSlots: rule.gameSlots.map((gs, i) => i === idx ? { ...gs, ...patch } : gs) });
  }
  function removeSlotFromDay(dow: number, idx: number) {
    const rule = getDayRule(dow);
    if (!rule) return;
    const next = rule.gameSlots.filter((_, i) => i !== idx);
    updateDayRule(dow, { gameSlots: next, maxGamesPerDay: next.length });
  }
  function addBlackout() {
    if (!newBlackout || config.blackoutDates.includes(newBlackout)) return;
    setConfig({ ...config, blackoutDates: [...config.blackoutDates, newBlackout].sort() });
    setNewBlackout('');
  }
  return (
    <div className="border border-border mb-4" style={{ fontFamily: 'var(--font-body)' }}>
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors"
      >
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em]">Scheduling Rules</span>
        {collapsed
          ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
          : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
      </button>

      {!collapsed && (
        <div className="px-4 pb-4 pt-1 space-y-5 border-t border-border">
          {/* Date Range */}
          <div>
            <h4 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-2">Date Range</h4>
            <div className="flex items-center gap-3 flex-wrap">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-muted-foreground">First Game Date</span>
                <input type="date" value={config.firstGameDate}
                  onChange={e => setConfig({ ...config, firstGameDate: e.target.value })}
                  className={FIELD_INPUT} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-muted-foreground">Last Game Date</span>
                <input type="date" value={config.lastGameDate}
                  onChange={e => setConfig({ ...config, lastGameDate: e.target.value })}
                  className={FIELD_INPUT} />
              </label>
            </div>
          </div>

          {/* Blackout Dates */}
          <div>
            <h4 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-2">Blackout Dates</h4>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {config.blackoutDates.map(d => (
                <span key={d} className="inline-flex items-center gap-1 px-2 py-0.5 bg-muted border border-border text-[11px]">
                  {d}
                  <button type="button" onClick={() => setConfig({ ...config, blackoutDates: config.blackoutDates.filter(x => x !== d) })}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input type="date" value={newBlackout} onChange={e => setNewBlackout(e.target.value)} className={FIELD_INPUT} />
              <button type="button" onClick={addBlackout}
                className={cn(BTN, "border-border text-muted-foreground hover:border-primary hover:text-primary")}>
                <Plus className="h-3 w-3" /> Add
              </button>
            </div>
          </div>

          {/* Matchup Rules */}
          <div>
            <h4 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-2">Matchup Rules</h4>
            <div className="space-y-2">
              <label className="flex items-center gap-3">
                <span className="text-xs">Games each team plays in the season</span>
                <input type="number" min={1} max={100}
                  value={config.targetGamesPerTeam ?? ''}
                  placeholder="—"
                  onChange={e => setConfig({ ...config, targetGamesPerTeam: e.target.value ? Number(e.target.value) : undefined })}
                  className={cn(FIELD_INPUT, "w-16")} />
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={config.noBackToBackMatchups ?? false}
                  onChange={e => setConfig({ ...config, noBackToBackMatchups: e.target.checked })}
                  className="accent-primary" />
                <span className="text-xs">Prevent same two teams from playing on back-to-back game days</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={config.allowDoubleHeaders ?? false}
                  onChange={e => setConfig({ ...config, allowDoubleHeaders: e.target.checked })}
                  className="accent-primary" />
                <span className="text-xs">Allow a team to play multiple games on the same day</span>
              </label>
            </div>
          </div>

          {/* Day Rules */}
          <div>
            <h4 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-2">Day Rules</h4>
            <div className="space-y-2">
              {([0, 1, 2, 3, 4, 5, 6] as DayRule['dayOfWeek'][]).map(dow => {
                const enabled = isDayEnabled(dow);
                const rule = getDayRule(dow);
                return (
                  <div key={dow} className={cn("border border-border p-3", enabled ? "border-primary/40" : "opacity-60")}>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" id={`sched-day-${dow}`} checked={enabled}
                        onChange={() => toggleDay(dow)} className="accent-primary" />
                      <label htmlFor={`sched-day-${dow}`} className="text-xs font-semibold cursor-pointer">{DAY_FULL[dow]}</label>
                    </div>
                    {enabled && rule && (
                      <div className="space-y-3 mt-3 ml-5">
                        <div className="flex items-start gap-4 flex-wrap">
                          <label className="flex flex-col gap-1">
                            <span className="text-[10px] text-muted-foreground">Max games/day</span>
                            <input type="number" min={1} value={rule.maxGamesPerDay}
                              onChange={e => updateDayRule(dow, { maxGamesPerDay: Number(e.target.value) })}
                              className={cn(FIELD_INPUT, "w-16")} />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[10px] text-muted-foreground">Max games/team/day</span>
                            <input type="number" min={1} value={rule.maxGamesPerTeamOnDay}
                              onChange={e => updateDayRule(dow, { maxGamesPerTeamOnDay: Number(e.target.value) })}
                              className={cn(FIELD_INPUT, "w-16")} />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[10px] text-muted-foreground">Target games/team <span className="normal-case font-normal">(optional)</span></span>
                            <input type="number" min={1} placeholder="—"
                              value={rule.targetGamesPerTeamForSeason ?? ''}
                              onChange={e => updateDayRule(dow, {
                                targetGamesPerTeamForSeason: e.target.value === '' ? undefined : Number(e.target.value)
                              })}
                              className={cn(FIELD_INPUT, "w-16")} />
                          </label>
                        </div>
                        <div>
                          <span className="text-[10px] text-muted-foreground block mb-1.5">Game Slots</span>
                          <div className="flex items-center gap-2 flex-wrap">
                            {rule.gameSlots.map((gs, i) => (
                              <span key={i} className="inline-flex items-center gap-1.5 border border-border bg-muted px-2 py-0.5 text-xs">
                                <input type="time" value={gs.time}
                                  onChange={e => updateSlotOnDay(dow, i, { time: e.target.value })}
                                  className="bg-transparent text-xs focus:outline-none w-[100px]" />
                                <span className="text-muted-foreground/40 select-none">|</span>
                                <input type="text" placeholder="Location"
                                  value={gs.fieldLocation}
                                  onChange={e => updateSlotOnDay(dow, i, { fieldLocation: e.target.value })}
                                  className={cn(FIELD_INPUT, "w-36 py-0")} />
                                <input type="text" placeholder="Field"
                                  value={gs.fieldName}
                                  onChange={e => updateSlotOnDay(dow, i, { fieldName: e.target.value })}
                                  className={cn(FIELD_INPUT, "w-[120px] py-0")} />
                                <button type="button" onClick={() => removeSlotFromDay(dow, i)}><X className="h-3 w-3" /></button>
                              </span>
                            ))}
                            <button type="button" onClick={() => addSlotToDay(dow)}
                              className={cn(BTN, "border-border text-muted-foreground hover:border-primary hover:text-primary text-[10px] px-2 py-0.5")}>
                              <Plus className="h-3 w-3" /> Slot
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onSave} disabled={saving}
              className={cn(BTN, "border-border text-muted-foreground hover:border-foreground hover:text-foreground disabled:opacity-50")}>
              {saving ? 'Saving…' : 'Save Rules'}
            </button>
            <button type="button" onClick={onGenerate}
              className={cn(BTN, "bg-primary text-primary-foreground border-primary hover:opacity-90")}>
              Generate Slots →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Scheduler Workspace ────────────────────────────────────────────────────────

function SchedulerWorkspace({
  slots,
  setSlots,
  teams,
  seasonId,
  config,
}: {
  slots: DraftSlot[];
  setSlots: React.Dispatch<React.SetStateAction<DraftSlot[]>>;
  teams: Team[];
  seasonId: number;
  config: ScheduleConfig;
}) {
  const [activeDrag, setActiveDrag] = useState<{ team: Team } | null>(null);
  const [committing, setCommitting] = useState(false);
  const [commitMode, setCommitMode] = useState<'add' | 'replace'>('add');
  const [existingCount, setExistingCount] = useState<number | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [commitSuccess, setCommitSuccess] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

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
      if (s.home) { const k = `${s.home.id}__${s.date}`; counts[k] = (counts[k] ?? 0) + 1; }
      if (s.away) { const k = `${s.away.id}__${s.date}`; counts[k] = (counts[k] ?? 0) + 1; }
    }
    return counts;
  }, [slots]);

  const assignedCount = slots.filter(s => s.home && s.away).length;
  const partialCount = slots.filter(s => (s.home || s.away) && !(s.home && s.away)).length;

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current;
    const team = data?.type === 'team' ? data.team : data?.type === 'slot-team' ? data.team : null;
    setActiveDrag(team ? { team } : null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current;
    const overData = over.data.current as { slotId: string; position: 'home' | 'away' } | undefined;
    if (!overData?.slotId) return;

    const draggedTeam: Team | null =
      activeData?.type === 'team' ? activeData.team
      : activeData?.type === 'slot-team' ? activeData.team
      : null;
    if (!draggedTeam) return;

    const { slotId, position } = overData;

    const isSrcMove = activeData?.type === 'slot-team';
    const srcSlotId: string | null = isSrcMove ? activeData.slotId : null;
    const srcPosition: 'home' | 'away' | null = isSrcMove ? activeData.position : null;

    if (isSrcMove && srcSlotId === slotId && srcPosition === position) return;

    setSlots(prev => {
      const destSlot = prev.find(s => s.id === slotId);
      if (!destSlot) return prev;

      // Enforce no double-headers: block if team already plays on this date
      if (!(config.allowDoubleHeaders ?? false)) {
        const alreadyPlays = prev.some(s => {
          if (s.date !== destSlot.date) return false;
          if (s.id === slotId) return false;
          if (srcSlotId && s.id === srcSlotId) return false; // source being vacated
          return s.home?.id === draggedTeam.id || s.away?.id === draggedTeam.id;
        });
        if (alreadyPlays) return prev;
      }

      return prev.map(s => {
        if (srcSlotId && s.id === srcSlotId) return { ...s, [srcPosition!]: null };
        if (s.id !== slotId) return s;
        const other = position === 'home' ? s.away : s.home;
        if (other?.id === draggedTeam.id) return s;
        return { ...s, [position]: draggedTeam };
      });
    });
  }

  function clearPosition(slotId: string, position: 'home' | 'away') {
    setSlots(prev => prev.map(s => s.id === slotId ? { ...s, [position]: null } : s));
  }

  function handleAutoFill() {
    const generatedGames = generateSchedule(config, teams).games;
    setSlots(prev => {
      // Create a fresh copy inside the updater so React StrictMode's
      // double-invocation doesn't exhaust the list on the first (discarded) call.
      const remaining = [...generatedGames];
      return prev.map(slot => {
        if (slot.home && slot.away) return slot;
        if (remaining.length === 0) return slot;
        const [g] = remaining.splice(0, 1);
        return {
          ...slot,
          home: slot.home ?? (teams.find(t => t.id === g.home) ?? null),
          away: slot.away ?? (teams.find(t => t.id === g.away) ?? null),
        };
      });
    });
  }

  useEffect(() => {
    if (!seasonId) return;
    fetch(`/api/seasons/${seasonId}/games?game_type=regular`)
      .then(r => r.json())
      .then(d => setExistingCount(Array.isArray(d.games) ? d.games.length : 0))
      .catch(() => setExistingCount(0));
  }, [seasonId]);

  async function handleCommit() {
    const complete = slots.filter(s => s.home && s.away);
    if (complete.length === 0) return;
    setCommitting(true);
    setCommitError(null);
    setCommitSuccess(false);
    try {
      const games = complete.map(s => ({
        gamedate: s.date,
        gametime: s.time,
        home: s.home!.id,
        away: s.away!.id,
        location: s.fieldLocation || undefined,
        field: s.fieldName || undefined,
      }));
      const res = await fetch(`/api/seasons/${seasonId}/games/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ games, mode: commitMode }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Commit failed');
      setCommitSuccess(true);
      setExistingCount(prev => commitMode === 'replace' ? complete.length : (prev ?? 0) + complete.length);
    } catch (e: any) {
      setCommitError(e.message);
    } finally {
      setCommitting(false);
    }
  }

  const slotsByDate = useMemo(() => {
    const map = new Map<string, DraftSlot[]>();
    for (const s of slots) {
      const arr = map.get(s.date) ?? [];
      arr.push(s);
      map.set(s.date, arr);
    }
    return map;
  }, [slots]);

  const sortedDates = useMemo(() => [...slotsByDate.keys()].sort(), [slotsByDate]);

  if (slots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border">
        <CalendarCheck className="h-8 w-8 text-muted-foreground mb-3" />
        <p className="text-sm font-medium text-muted-foreground">No slots generated yet</p>
        <p className="text-xs text-muted-foreground mt-1">Configure rules above and click "Generate Slots →" to begin scheduling.</p>
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 items-start" style={{ fontFamily: 'var(--font-body)' }}>
        {/* Teams Sidebar */}
        <div className="w-48 shrink-0 border border-border sticky top-4">
          <div className="px-3 py-2 border-b border-border bg-muted/30">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Teams</span>
          </div>
          <div className="p-2 space-y-1.5">
            {teams.map(t => {
              const count = teamGameCounts[t.id] ?? 0;
              const targets = config.dayRules.filter(r => r.targetGamesPerTeamForSeason).map(r => r.targetGamesPerTeamForSeason!);
              const totalTarget = targets.length > 0 ? targets.reduce((a, b) => a + b, 0) : null;
              const isAtTarget = totalTarget !== null && count >= totalTarget;
              const isUnder = totalTarget !== null && count < totalTarget;

              return (
                <div key={t.id} className="flex items-center justify-between gap-1">
                  <TeamChip team={t} />
                  <span className={cn(
                    "text-[10px] font-semibold tabular-nums shrink-0",
                    count === 0 ? "text-destructive" : isAtTarget ? "text-green-600 dark:text-green-400" : isUnder ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
                  )}>
                    {count}g
                  </span>
                </div>
              );
            })}
          </div>
          <div className="p-2 border-t border-border">
            <button type="button" onClick={handleAutoFill}
              className={cn(BTN, "w-full justify-center border-border text-muted-foreground hover:border-primary hover:text-primary text-[10px]")}>
              <Wand2 className="h-3 w-3" /> Auto-fill
            </button>
          </div>
        </div>

        {/* Slot Grid */}
        <div className="flex-1 min-w-0">
          {/* Stats bar */}
          <div className="flex items-center gap-4 mb-3 flex-wrap">
            <span className="text-[11px] text-muted-foreground">
              <span className="font-semibold text-foreground">{assignedCount}</span>/{slots.length} slots filled
            </span>
            {partialCount > 0 && (
              <span className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> {partialCount} partial
              </span>
            )}
            {commitSuccess && (
              <span className="text-[11px] text-green-600 dark:text-green-400 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Committed to schedule
              </span>
            )}
          </div>

          <div className="space-y-5">
            {sortedDates.map(date => {
              const dateSlots = slotsByDate.get(date)!;
              const d = new Date(date + 'T00:00:00Z');
              const dayLabel = DAY_FULL[d.getUTCDay()];
              const dateFormatted = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
              const dowForDate = d.getUTCDay();
              const dayRule = config.dayRules.find(r => r.dayOfWeek === dowForDate);

              return (
                <div key={date}>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-2">
                    {dayLabel}, {dateFormatted}
                  </div>
                  <div className="space-y-1.5">
                    {dateSlots.map(slot => {
                      const maxPerTeam = dayRule?.maxGamesPerTeamOnDay ?? 1;
                      const homeConflict = slot.home
                        ? (teamDateCounts[`${slot.home.id}__${date}`] ?? 0) > maxPerTeam
                        : false;
                      const awayConflict = slot.away
                        ? (teamDateCounts[`${slot.away.id}__${date}`] ?? 0) > maxPerTeam
                        : false;

                      return (
                        <div key={slot.id} className="flex items-center gap-2">
                          <SlotPosition slotId={slot.id} position="home" team={slot.home}
                            onClear={() => clearPosition(slot.id, 'home')} conflicted={homeConflict} />
                          <span className="text-[10px] text-muted-foreground font-bold">vs</span>
                          <SlotPosition slotId={slot.id} position="away" team={slot.away}
                            onClear={() => clearPosition(slot.id, 'away')} conflicted={awayConflict} />
                          <span className="text-[11px] text-muted-foreground w-20 shrink-0 tabular-nums">
                            {fmt12h(slot.time)}
                          </span>
                          {(slot.fieldName || slot.fieldLocation) && (
                            <span className="text-[11px] text-muted-foreground flex-1 min-w-0 truncate">
                              {[slot.fieldLocation, slot.fieldName].filter(Boolean).join(' · ')}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Commit bar */}
          <div className="mt-6 pt-4 border-t border-border flex items-center justify-between flex-wrap gap-3">
            <div className="space-y-1.5">
              {commitError && (
                <p className="text-xs text-destructive flex items-center gap-1.5">
                  <AlertTriangle className="h-3 w-3" /> {commitError}
                </p>
              )}
              {existingCount !== null && existingCount > 0 && (
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="text-[11px] text-amber-700 dark:text-amber-300">
                    {existingCount} existing regular game{existingCount !== 1 ? 's' : ''} on schedule
                  </span>
                  <div className="flex items-center gap-3">
                    {(['add', 'replace'] as const).map(m => (
                      <label key={m} className="flex items-center gap-1.5 text-[11px] cursor-pointer">
                        <input type="radio" name="commit-mode" value={m} checked={commitMode === m}
                          onChange={() => setCommitMode(m)} className="accent-primary" />
                        {m === 'add' ? 'Add to existing' : 'Replace existing'}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button type="button"
                onClick={() => setSlots(prev => prev.map(s => ({ ...s, home: null, away: null })))}
                className={cn(BTN, "border-border text-muted-foreground hover:border-foreground hover:text-foreground text-[10px]")}>
                Clear All
              </button>
              <button type="button" onClick={handleCommit}
                disabled={committing || assignedCount === 0}
                className={cn(BTN, "bg-primary text-primary-foreground border-primary hover:opacity-90 disabled:opacity-50")}>
                <CalendarCheck className="h-3.5 w-3.5" />
                {committing ? 'Committing…' : `Commit ${assignedCount} Game${assignedCount !== 1 ? 's' : ''} to Schedule`}
              </button>
            </div>
          </div>
        </div>
      </div>

      <DragOverlay>
        {activeDrag ? <DraggingChip team={activeDrag.team} /> : null}
      </DragOverlay>
    </DndContext>
  );
}

// ─── Page Body ──────────────────────────────────────────────────────────────────

function SchedulingBody() {
  const { seasonId, season, setSeason, canEdit } = useSeason();
  const [config, setConfig] = useState<ScheduleConfig>(BLANK_CONFIG);
  const [teams, setTeams] = useState<Team[]>([]);
  const [slots, setSlots] = useState<DraftSlot[]>([]);
  const [saving, setSaving] = useState(false);
  const [teamsErr, setTeamsErr] = useState<string | null>(null);

  useEffect(() => {
    if (season?.schedule_config) setConfig(normalizeScheduleConfig(season.schedule_config));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season?.id]);

  useEffect(() => {
    if (!seasonId) return;
    fetch(`/api/seasons/${seasonId}/teams`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setTeams((Array.isArray(d.teams) ? d.teams : []).map((t: { id: number; name: string }) => ({ id: t.id, name: t.name })));
      })
      .catch(e => setTeamsErr(e.message));
  }, [seasonId]);

  async function handleSaveRules() {
    if (!seasonId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/seasons/${seasonId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule_config: config }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Save failed');
      setSeason(prev => prev ? { ...prev, schedule_config: config } : prev);
    } finally {
      setSaving(false);
    }
  }

  function handleGenerateSlots() {
    const rawSlots = buildSlots(config);
    setSlots(rawSlots.map((s, i) => ({
      id: `${s.date}__${s.time}__${s.field.name || String(i)}`,
      date: s.date,
      time: s.time,
      fieldName: s.field.name,
      fieldLocation: s.field.location,
      home: null,
      away: null,
    })));
  }

  return (
    <div style={{ fontFamily: 'var(--font-body)' }}>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '20px', textTransform: 'uppercase', letterSpacing: '-0.01em' }}>
            Scheduling
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {teams.length} team{teams.length !== 1 ? 's' : ''} enrolled
          </p>
        </div>
      </div>

      {teamsErr && (
        <div className="flex items-center gap-2 p-3 mb-4 bg-destructive/10 border border-destructive/30 text-destructive text-xs">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {teamsErr}
        </div>
      )}

      {teams.length < 2 && !teamsErr && (
        <div className="flex items-center gap-2 p-3 mb-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-400/40 text-amber-800 dark:text-amber-300 text-xs">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          At least 2 teams must be enrolled before scheduling games.
        </div>
      )}

      {canEdit && (
        <SchedulingRules
          config={config}
          setConfig={setConfig}
          onSave={handleSaveRules}
          onGenerate={handleGenerateSlots}
          saving={saving}
        />
      )}

      <SchedulerWorkspace
        slots={slots}
        setSlots={setSlots}
        teams={teams}
        seasonId={seasonId!}
        config={config}
      />
    </div>
  );
}

export default function SchedulingPage() {
  return (
    <SeasonProvider>
      <SeasonShell tab="scheduling">
        <SchedulingBody />
      </SeasonShell>
    </SeasonProvider>
  );
}
