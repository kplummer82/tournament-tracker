// pages/seasons/[seasonid]/scheduling.tsx
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from "react";
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
  Wand2, CalendarCheck, Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ScheduleConfig, DayRule, Team, GameTimeSlot, Matchup } from "@/lib/auto-schedule";
import { buildSlots, normalizeScheduleConfig, buildMatchups, generateBalancedGames, weekMonday } from "@/lib/auto-schedule";

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

function fmtDateTS(date: string): string {
  const [y, m, d] = date.split('-');
  return `${parseInt(m)}/${parseInt(d)}/${y}`;
}

function csvCell(val: string): string {
  if (/[",\n\r]/.test(val)) return `"${val.replace(/"/g, '""')}"`;
  return val;
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
  evenHomeAway: true,
  evenFields: true,
  evenTimes: true,
  evenRestDays: true,
  maxWeekdayGamesPerWeek: undefined,
  minWeekendGamesPerWeek: 1,
  enforceRoundCompletion: true,
  roundCompletionX: 1,
  roundCompletionY: 2,
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
  saving,
}: {
  config: ScheduleConfig;
  setConfig: (c: ScheduleConfig) => void;
  onSave: () => Promise<void>;
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
              <label className="flex items-center gap-3">
                <span className="text-xs">Max weekday (Mon–Fri) games per team per week</span>
                <input type="number" min={1} max={10}
                  value={config.maxWeekdayGamesPerWeek ?? ''}
                  placeholder="—"
                  onChange={e => setConfig({ ...config, maxWeekdayGamesPerWeek: e.target.value ? Number(e.target.value) : undefined })}
                  className={cn(FIELD_INPUT, "w-16")} />
              </label>
              <label className="flex items-center gap-3">
                <span className="text-xs">Min weekend (Sat–Sun) games per team per week</span>
                <input type="number" min={1} max={10}
                  value={config.minWeekendGamesPerWeek ?? ''}
                  placeholder="—"
                  onChange={e => setConfig({ ...config, minWeekendGamesPerWeek: e.target.value ? Number(e.target.value) : undefined })}
                  className={cn(FIELD_INPUT, "w-16")} />
              </label>
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={config.enforceRoundCompletion ?? true}
                    onChange={e => setConfig({ ...config, enforceRoundCompletion: e.target.checked })}
                    className="accent-primary" />
                  <span className="text-xs">Schedule all pairings before repeating matchups</span>
                </label>
                {(config.enforceRoundCompletion ?? true) && (
                  <div className="flex items-center gap-2 ml-5 flex-wrap">
                    <span className="text-xs text-muted-foreground">Enforce starting at game</span>
                    <input type="number" min={2} max={10}
                      value={config.roundCompletionY ?? 2}
                      onChange={e => setConfig({ ...config, roundCompletionY: Math.max(2, Number(e.target.value)) })}
                      className={cn(FIELD_INPUT, "w-12")} />
                    <span className="text-xs text-muted-foreground">against the same opponent</span>
                  </div>
                )}
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={config.allowDoubleHeaders ?? false}
                  onChange={e => setConfig({ ...config, allowDoubleHeaders: e.target.checked })}
                  className="accent-primary" />
                <span className="text-xs">Allow a team to play multiple games on the same day</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={config.evenHomeAway ?? true}
                  onChange={e => setConfig({ ...config, evenHomeAway: e.target.checked })}
                  className="accent-primary" />
                <span className="text-xs">Balance home and away games evenly per team</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={config.evenFields ?? true}
                  onChange={e => setConfig({ ...config, evenFields: e.target.checked })}
                  className="accent-primary" />
                <span className="text-xs">Balance games across fields evenly per team</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={config.evenTimes ?? true}
                  onChange={e => setConfig({ ...config, evenTimes: e.target.checked })}
                  className="accent-primary" />
                <span className="text-xs">Balance games across time slots evenly per team</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={config.evenRestDays ?? true}
                  onChange={e => setConfig({ ...config, evenRestDays: e.target.checked })}
                  className="accent-primary" />
                <span className="text-xs">Balance rest days between games per team</span>
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
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Scheduler Workspace ────────────────────────────────────────────────────────

interface WorkspaceHandle {
  autoFill: () => void;
  exportCsv: () => void;
  commit: () => Promise<void>;
}

const SchedulerWorkspace = forwardRef<WorkspaceHandle, {
  slots: DraftSlot[];
  setSlots: React.Dispatch<React.SetStateAction<DraftSlot[]>>;
  teams: Team[];
  seasonId: number;
  config: ScheduleConfig;
  committing: boolean;
  setCommitting: (v: boolean) => void;
  commitMode: 'add' | 'replace';
  existingCount: number | null;
  setExistingCount: React.Dispatch<React.SetStateAction<number | null>>;
  commitError: string | null;
  setCommitError: (v: string | null) => void;
  commitSuccess: boolean;
  setCommitSuccess: (v: boolean) => void;
  setAutoFillFeedback: (v: { restDays: number; backToBack: number; roundCompletion: number; weekdayLimit: number } | null) => void;
}>(function SchedulerWorkspace({ slots, setSlots, teams, seasonId, config,
  committing, setCommitting, commitMode, existingCount, setExistingCount,
  commitError, setCommitError, commitSuccess, setCommitSuccess, setAutoFillFeedback }, ref) {
  const [activeDrag, setActiveDrag] = useState<{ team: Team } | null>(null);

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
    // Generate the game pool before setSlots so it's stable across StrictMode invocations.
    // TARGETED: circle-method exact list (every team plays exactly targetGamesPerTeam times).
    // NON-TARGETED: over-generated pool managed by RC penalty.
    const isTargeted = !!(config.targetGamesPerTeam && teams.length >= 2);
    const shuffled = [...teams];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const baseGames: Matchup[] = isTargeted
      ? generateBalancedGames(shuffled, config.targetGamesPerTeam!)
      : buildMatchups(shuffled, config.maxRepeatMatchups);

    const relaxationCounts = { restDays: 0, backToBack: 0, roundCompletion: 0, weekdayLimit: 0 };

    setSlots(prev => {
      // ── Tracking maps (shared by both paths) ───────────────────────────────
      const teamsPerDate = new Map<string, Map<number, number>>();
      const gamesPerTeam = new Map<number, number>();
      const homeCount    = new Map<number, number>();
      const awayCount    = new Map<number, number>();
      const fieldCount   = new Map<number, Map<string, number>>();
      const timeCount    = new Map<number, Map<string, number>>();
      const matchupLastDate = new Map<string, string>();
      const matchupCount    = new Map<string, number>();
      const weekdayGamesPerTeamWeek = new Map<string, number>();
      const weekendGamesPerTeamWeek = new Map<string, number>();
      const teamLastGameDate = new Map<number, string>();
      for (const t of teams) {
        gamesPerTeam.set(t.id, 0); homeCount.set(t.id, 0); awayCount.set(t.id, 0);
        fieldCount.set(t.id, new Map()); timeCount.set(t.id, new Map());
      }

      // Only seed complete games (both home and away set). Partial slots (one team
      // set, the other null) are not real games yet — counting them would inflate
      // gamesPerTeam and block valid matchups for the pre-set team too early.
      for (const s of prev) {
        if (!s.home || !s.away) continue;
        const sfk = `${s.fieldName}|${s.fieldLocation}`;
        gamesPerTeam.set(s.home.id, (gamesPerTeam.get(s.home.id) ?? 0) + 1);
        gamesPerTeam.set(s.away.id, (gamesPerTeam.get(s.away.id) ?? 0) + 1);
        homeCount.set(s.home.id, (homeCount.get(s.home.id) ?? 0) + 1);
        awayCount.set(s.away.id, (awayCount.get(s.away.id) ?? 0) + 1);
        if (!teamsPerDate.has(s.date)) teamsPerDate.set(s.date, new Map());
        const sdm = teamsPerDate.get(s.date)!;
        sdm.set(s.home.id, (sdm.get(s.home.id) ?? 0) + 1);
        sdm.set(s.away.id, (sdm.get(s.away.id) ?? 0) + 1);
        const hfm = fieldCount.get(s.home.id)!; hfm.set(sfk, (hfm.get(sfk) ?? 0) + 1);
        const afm = fieldCount.get(s.away.id)!;  afm.set(sfk, (afm.get(sfk) ?? 0) + 1);
        const htm = timeCount.get(s.home.id)!;   htm.set(s.time, (htm.get(s.time) ?? 0) + 1);
        const atm = timeCount.get(s.away.id)!;   atm.set(s.time, (atm.get(s.time) ?? 0) + 1);
        const k = `${Math.min(s.home.id, s.away.id)}-${Math.max(s.home.id, s.away.id)}`;
        if (!matchupLastDate.has(k) || s.date > matchupLastDate.get(k)!) matchupLastDate.set(k, s.date);
        matchupCount.set(k, (matchupCount.get(k) ?? 0) + 1);
        if (!teamLastGameDate.has(s.home.id) || s.date > teamLastGameDate.get(s.home.id)!) teamLastGameDate.set(s.home.id, s.date);
        if (!teamLastGameDate.has(s.away.id) || s.date > teamLastGameDate.get(s.away.id)!) teamLastGameDate.set(s.away.id, s.date);
        const sDow = new Date(s.date + 'T00:00:00Z').getUTCDay();
        const swk = weekMonday(s.date);
        const hWK = `${s.home.id}|${swk}`, aWK = `${s.away.id}|${swk}`;
        if (sDow >= 1 && sDow <= 5) {
          weekdayGamesPerTeamWeek.set(hWK, (weekdayGamesPerTeamWeek.get(hWK) ?? 0) + 1);
          weekdayGamesPerTeamWeek.set(aWK, (weekdayGamesPerTeamWeek.get(aWK) ?? 0) + 1);
        } else {
          weekendGamesPerTeamWeek.set(hWK, (weekendGamesPerTeamWeek.get(hWK) ?? 0) + 1);
          weekendGamesPerTeamWeek.set(aWK, (weekendGamesPerTeamWeek.get(aWK) ?? 0) + 1);
        }
      }

      // Ordered unique game dates for back-to-back detection.
      const gameDates = [...new Set(prev.map(s => s.date))].sort();
      const prevGameDate = new Map<string, string>();
      for (let i = 1; i < gameDates.length; i++) {
        prevGameDate.set(gameDates[i], gameDates[i - 1]);
      }

      // ── Pending game pool ──────────────────────────────────────────────────
      // TARGETED: exact game list minus already-scheduled pairs (no RC penalty needed).
      // NON-TARGETED: full generated pool (RC penalty manages repeat matchups).
      let pending: Matchup[];
      if (isTargeted) {
        const mcCopy = new Map(matchupCount);
        pending = baseGames.filter(m => {
          const k = `${Math.min(m.home.id, m.away.id)}-${Math.max(m.home.id, m.away.id)}`;
          const cnt = mcCopy.get(k) ?? 0;
          if (cnt > 0) { mcCopy.set(k, cnt - 1); return false; }
          return true;
        });
      } else {
        pending = [...baseGames]; // fresh copy per invocation — StrictMode safe
      }

      // ── Slot-first assignment ──────────────────────────────────────────────
      // Fill one slot, updating shared state maps in place.
      // relaxRC=true: skip RC penalty (used for TARGETED path and pass 2).
      function fillSlot(slot: DraftSlot, relaxRC: boolean): DraftSlot {
        if (slot.home && slot.away) return slot;

        // Sort pending so the most-underserved team pairs come first in the scan.
        pending.sort((a, b) =>
          ((gamesPerTeam.get(a.home.id) ?? 0) + (gamesPerTeam.get(a.away.id) ?? 0)) -
          ((gamesPerTeam.get(b.home.id) ?? 0) + (gamesPerTeam.get(b.away.id) ?? 0))
        );

        // When one team is already locked into the slot, only consider matchups
        // that include that team — otherwise the wrong pair gets spliced from
        // pending and state tracking diverges from the actual game scheduled.
        const fixedHome = slot.home;
        const fixedAway = slot.away;

        const dateMap = teamsPerDate.get(slot.date) ?? new Map<number, number>();
        const dow = new Date(slot.date + 'T00:00:00Z').getUTCDay() as DayRule['dayOfWeek'];
        const isWeekday = dow >= 1 && dow <= 5;
        const slotWeek = weekMonday(slot.date);
        const dayRule = config.dayRules.find(r => r.dayOfWeek === dow);
        const maxPerDay = (config.allowDoubleHeaders ?? false)
          ? (dayRule?.maxGamesPerTeamOnDay ?? 1)
          : 1;
        const prevDate = prevGameDate.get(slot.date);
        const fk = `${slot.fieldName}|${slot.fieldLocation}`;

        function restDayPenalty(teamId: number): number {
          const last = teamLastGameDate.get(teamId);
          if (!last) return 0;
          const gap = Math.round(
            (new Date(slot.date + 'T00:00:00Z').getTime() - new Date(last + 'T00:00:00Z').getTime()) / 86400000
          );
          if (gap >= 1 && gap <= 2) return 4;
          if (gap >= 3 && gap <= 4) return 1;
          return 0;
        }

        function scoreOrientation(home: Team, away: Team, skipRestDays: boolean): number {
          let s = (gamesPerTeam.get(home.id) ?? 0) + (gamesPerTeam.get(away.id) ?? 0);
          if (config.evenHomeAway ?? true) s += (homeCount.get(home.id) ?? 0) + (awayCount.get(away.id) ?? 0);
          if (config.evenFields  ?? true) s += (fieldCount.get(home.id)?.get(fk) ?? 0) + (fieldCount.get(away.id)?.get(fk) ?? 0);
          if (config.evenTimes   ?? true) s += (timeCount.get(home.id)?.get(slot.time) ?? 0) + (timeCount.get(away.id)?.get(slot.time) ?? 0);
          if (!skipRestDays && (config.evenRestDays ?? true)) s += restDayPenalty(home.id) + restDayPenalty(away.id);
          if (!isWeekday && config.minWeekendGamesPerWeek) {
            if ((weekendGamesPerTeamWeek.get(`${home.id}|${slotWeek}`) ?? 0) >= config.minWeekendGamesPerWeek) s += 3;
            if ((weekendGamesPerTeamWeek.get(`${away.id}|${slotWeek}`) ?? 0) >= config.minWeekendGamesPerWeek) s += 3;
          }
          return s;
        }

        function passesConstraints(m: { home: Team; away: Team }, relaxBtB: boolean, relaxMaxWkday: boolean): boolean {
          if ((dateMap.get(m.home.id) ?? 0) >= maxPerDay) return false;
          if ((dateMap.get(m.away.id) ?? 0) >= maxPerDay) return false;
          if (config.targetGamesPerTeam) {
            if ((gamesPerTeam.get(m.home.id) ?? 0) >= config.targetGamesPerTeam) return false;
            if ((gamesPerTeam.get(m.away.id) ?? 0) >= config.targetGamesPerTeam) return false;
          }
          if (!relaxBtB && config.noBackToBackMatchups && prevDate) {
            const k = `${Math.min(m.home.id, m.away.id)}-${Math.max(m.home.id, m.away.id)}`;
            if (matchupLastDate.get(k) === prevDate) return false;
          }
          if (!relaxMaxWkday && config.maxWeekdayGamesPerWeek && isWeekday) {
            if ((weekdayGamesPerTeamWeek.get(`${m.home.id}|${slotWeek}`) ?? 0) >= config.maxWeekdayGamesPerWeek) return false;
            if ((weekdayGamesPerTeamWeek.get(`${m.away.id}|${slotWeek}`) ?? 0) >= config.maxWeekdayGamesPerWeek) return false;
          }
          return true;
        }

        let bestIdx = -1, bestScore = Infinity, bestFlipped = false, bestPass = 0;
        // Progressive relaxation: each pass relaxes one more constraint.
        // Pass 0: all rules | 1: +relax rest days | 2: +relax BtB | 3: +skip RC | 4: +relax weekday limit
        const maxPasses = relaxRC ? 5 : 3;
        for (let pass = 0; pass < maxPasses && bestIdx === -1; pass++) {
          const relaxRestDays  = pass >= 1;
          const relaxBtB       = pass >= 2;
          const skipRC         = pass >= 3;
          const relaxMaxWkday  = pass >= 4;
          if (pass === 1 && !(config.evenRestDays ?? true)) continue;
          if (pass === 2 && !config.noBackToBackMatchups) continue;
          if (pass === 4 && !config.maxWeekdayGamesPerWeek) continue;
          for (let i = 0; i < pending.length; i++) {
            const m = pending[i];
            if (fixedHome && m.home.id !== fixedHome.id && m.away.id !== fixedHome.id) continue;
            if (fixedAway && m.home.id !== fixedAway.id && m.away.id !== fixedAway.id) continue;
            if (!passesConstraints(m, relaxBtB, relaxMaxWkday)) continue;
            let sA = scoreOrientation(m.home, m.away, relaxRestDays);
            let sB = (config.evenHomeAway ?? true) ? scoreOrientation(m.away, m.home, relaxRestDays) : sA;
            if (!skipRC && (config.enforceRoundCompletion ?? true) && teams.length > 2) {
              const rcY = config.roundCompletionY ?? 2;
              const rcKey = `${Math.min(m.home.id, m.away.id)}-${Math.max(m.home.id, m.away.id)}`;
              const currentCount = matchupCount.get(rcKey) ?? 0;
              if (currentCount + 1 >= rcY) {
                let penalty = 0;
                for (const t of teams) {
                  if (t.id === m.home.id || t.id === m.away.id) continue;
                  const hk = `${Math.min(m.home.id, t.id)}-${Math.max(m.home.id, t.id)}`;
                  const ak = `${Math.min(m.away.id, t.id)}-${Math.max(m.away.id, t.id)}`;
                  if ((matchupCount.get(hk) ?? 0) < currentCount) penalty += 1000;
                  if ((matchupCount.get(ak) ?? 0) < currentCount) penalty += 1000;
                }
                sA += penalty;
                sB += penalty;
              }
            }
            const best = Math.min(sA, sB);
            if (best < bestScore) { bestScore = best; bestIdx = i; bestFlipped = sB < sA; bestPass = pass; }
          }
        }

        if (bestIdx === -1) return slot;
        if (bestPass >= 1) relaxationCounts.restDays++;
        if (bestPass >= 2) relaxationCounts.backToBack++;
        if (bestPass >= 3) relaxationCounts.roundCompletion++;
        if (bestPass >= 4) relaxationCounts.weekdayLimit++;
        const raw = pending.splice(bestIdx, 1)[0];
        let matchup = bestFlipped ? { home: raw.away, away: raw.home } : raw;
        if (fixedHome && matchup.home.id !== fixedHome.id) matchup = { home: matchup.away, away: matchup.home };
        if (fixedAway && matchup.away.id !== fixedAway.id) matchup = { home: matchup.away, away: matchup.home };

        gamesPerTeam.set(matchup.home.id, (gamesPerTeam.get(matchup.home.id) ?? 0) + 1);
        gamesPerTeam.set(matchup.away.id, (gamesPerTeam.get(matchup.away.id) ?? 0) + 1);
        homeCount.set(matchup.home.id, (homeCount.get(matchup.home.id) ?? 0) + 1);
        awayCount.set(matchup.away.id, (awayCount.get(matchup.away.id) ?? 0) + 1);
        if (!teamsPerDate.has(slot.date)) teamsPerDate.set(slot.date, new Map());
        const dm = teamsPerDate.get(slot.date)!;
        dm.set(matchup.home.id, (dm.get(matchup.home.id) ?? 0) + 1);
        dm.set(matchup.away.id, (dm.get(matchup.away.id) ?? 0) + 1);
        const hfm = fieldCount.get(matchup.home.id)!; hfm.set(fk, (hfm.get(fk) ?? 0) + 1);
        const afm = fieldCount.get(matchup.away.id)!; afm.set(fk, (afm.get(fk) ?? 0) + 1);
        const htm = timeCount.get(matchup.home.id)!;  htm.set(slot.time, (htm.get(slot.time) ?? 0) + 1);
        const atm = timeCount.get(matchup.away.id)!;  atm.set(slot.time, (atm.get(slot.time) ?? 0) + 1);
        const pk = `${Math.min(matchup.home.id, matchup.away.id)}-${Math.max(matchup.home.id, matchup.away.id)}`;
        matchupLastDate.set(pk, slot.date);
        matchupCount.set(pk, (matchupCount.get(pk) ?? 0) + 1);
        if (!teamLastGameDate.has(matchup.home.id) || slot.date > teamLastGameDate.get(matchup.home.id)!) teamLastGameDate.set(matchup.home.id, slot.date);
        if (!teamLastGameDate.has(matchup.away.id) || slot.date > teamLastGameDate.get(matchup.away.id)!) teamLastGameDate.set(matchup.away.id, slot.date);
        if (isWeekday) {
          const hWK = `${matchup.home.id}|${slotWeek}`;
          const aWK = `${matchup.away.id}|${slotWeek}`;
          weekdayGamesPerTeamWeek.set(hWK, (weekdayGamesPerTeamWeek.get(hWK) ?? 0) + 1);
          weekdayGamesPerTeamWeek.set(aWK, (weekdayGamesPerTeamWeek.get(aWK) ?? 0) + 1);
        } else {
          const hWK = `${matchup.home.id}|${slotWeek}`;
          const aWK = `${matchup.away.id}|${slotWeek}`;
          weekendGamesPerTeamWeek.set(hWK, (weekendGamesPerTeamWeek.get(hWK) ?? 0) + 1);
          weekendGamesPerTeamWeek.set(aWK, (weekendGamesPerTeamWeek.get(aWK) ?? 0) + 1);
        }

        return { ...slot, home: matchup.home, away: matchup.away };
      }

      // TARGETED: round-first assignment. generateBalancedGames returns matchups
      // in round blocks (each contiguous group of N/2 is a circle-method round
      // where every team appears exactly once — a guaranteed perfect matching).
      // Assign one complete round per full-size date so every slot is fillable.
      // Remaining dates (fewer slots) use the greedy fillSlot.
      //
      // NON-TARGETED: slot-first greedy (RC penalty manages repeat matchups).
      function updateTrackingMaps(matchup: Matchup, slot: DraftSlot) {
        gamesPerTeam.set(matchup.home.id, (gamesPerTeam.get(matchup.home.id) ?? 0) + 1);
        gamesPerTeam.set(matchup.away.id, (gamesPerTeam.get(matchup.away.id) ?? 0) + 1);
        homeCount.set(matchup.home.id, (homeCount.get(matchup.home.id) ?? 0) + 1);
        awayCount.set(matchup.away.id, (awayCount.get(matchup.away.id) ?? 0) + 1);
        if (!teamsPerDate.has(slot.date)) teamsPerDate.set(slot.date, new Map());
        const dm = teamsPerDate.get(slot.date)!;
        dm.set(matchup.home.id, (dm.get(matchup.home.id) ?? 0) + 1);
        dm.set(matchup.away.id, (dm.get(matchup.away.id) ?? 0) + 1);
        const dfk = `${slot.fieldName}|${slot.fieldLocation}`;
        const hfm = fieldCount.get(matchup.home.id)!; hfm.set(dfk, (hfm.get(dfk) ?? 0) + 1);
        const afm = fieldCount.get(matchup.away.id)!; afm.set(dfk, (afm.get(dfk) ?? 0) + 1);
        const htm = timeCount.get(matchup.home.id)!; htm.set(slot.time, (htm.get(slot.time) ?? 0) + 1);
        const atm = timeCount.get(matchup.away.id)!; atm.set(slot.time, (atm.get(slot.time) ?? 0) + 1);
        const dpk = `${Math.min(matchup.home.id, matchup.away.id)}-${Math.max(matchup.home.id, matchup.away.id)}`;
        matchupLastDate.set(dpk, slot.date);
        matchupCount.set(dpk, (matchupCount.get(dpk) ?? 0) + 1);
        if (!teamLastGameDate.has(matchup.home.id) || slot.date > teamLastGameDate.get(matchup.home.id)!) teamLastGameDate.set(matchup.home.id, slot.date);
        if (!teamLastGameDate.has(matchup.away.id) || slot.date > teamLastGameDate.get(matchup.away.id)!) teamLastGameDate.set(matchup.away.id, slot.date);
        const ddow = new Date(slot.date + 'T00:00:00Z').getUTCDay();
        const dSlotWeek = weekMonday(slot.date);
        if (ddow >= 1 && ddow <= 5) {
          weekdayGamesPerTeamWeek.set(`${matchup.home.id}|${dSlotWeek}`, (weekdayGamesPerTeamWeek.get(`${matchup.home.id}|${dSlotWeek}`) ?? 0) + 1);
          weekdayGamesPerTeamWeek.set(`${matchup.away.id}|${dSlotWeek}`, (weekdayGamesPerTeamWeek.get(`${matchup.away.id}|${dSlotWeek}`) ?? 0) + 1);
        } else {
          weekendGamesPerTeamWeek.set(`${matchup.home.id}|${dSlotWeek}`, (weekendGamesPerTeamWeek.get(`${matchup.home.id}|${dSlotWeek}`) ?? 0) + 1);
          weekendGamesPerTeamWeek.set(`${matchup.away.id}|${dSlotWeek}`, (weekendGamesPerTeamWeek.get(`${matchup.away.id}|${dSlotWeek}`) ?? 0) + 1);
        }
      }

      let result = [...prev];

      if (isTargeted) {
        const halfN = Math.floor(teams.length / 2);
        const canUseRounds = teams.length % 2 === 0 && halfN > 0
          && pending.length >= halfN;

        if (canUseRounds) {
          // Build rounds from pending BEFORE Phase 0 so round boundaries are intact.
          const fullRoundCount = Math.floor(pending.length / halfN);
          const rounds: Matchup[][] = [];
          for (let i = 0; i < fullRoundCount * halfN; i += halfN) {
            rounds.push(pending.slice(i, i + halfN));
          }
          const leftover = pending.slice(fullRoundCount * halfN);

          // Phase 0: fill partial slots by pulling matchups from their rounds.
          let phase0Count = 0;
          const phase0RoundDates = new Map<number, Set<string>>();
          for (let pi = 0; pi < result.length; pi++) {
            const slot = result[pi];
            if ((slot.home && slot.away) || (!slot.home && !slot.away)) continue;
            const fixedTeam = slot.home ?? slot.away!;
            const pos: 'home' | 'away' = slot.home ? 'home' : 'away';

            let bestRi = -1, bestMi = -1, bestScore = Infinity;
            for (let ri = 0; ri < rounds.length; ri++) {
              for (let mi = 0; mi < rounds[ri].length; mi++) {
                const m = rounds[ri][mi];
                if (m.home.id !== fixedTeam.id && m.away.id !== fixedTeam.id) continue;
                const opponent = m.home.id === fixedTeam.id ? m.away : m.home;
                if (config.targetGamesPerTeam && (gamesPerTeam.get(opponent.id) ?? 0) >= config.targetGamesPerTeam) continue;
                const s = gamesPerTeam.get(opponent.id) ?? 0;
                if (s < bestScore) { bestScore = s; bestRi = ri; bestMi = mi; }
              }
            }
            if (bestRi !== -1) {
              if (!phase0RoundDates.has(bestRi)) phase0RoundDates.set(bestRi, new Set());
              phase0RoundDates.get(bestRi)!.add(slot.date);
              const raw = rounds[bestRi].splice(bestMi, 1)[0];
              const opponent = raw.home.id === fixedTeam.id ? raw.away : raw.home;
              const matchup = pos === 'home'
                ? { home: fixedTeam, away: opponent }
                : { home: opponent, away: fixedTeam };
              result[pi] = { ...result[pi], home: matchup.home, away: matchup.away };
              updateTrackingMaps(matchup, result[pi]);
              phase0Count++;
              if (process.env.NODE_ENV !== 'production') {
                console.log(`[phase0] partial ${fixedTeam.name} on ${slot.date} → opponent ${opponent.name} (from round ${bestRi})`);
              }
            } else if (process.env.NODE_ENV !== 'production') {
              console.log(`[phase0] FAILED to find opponent for ${fixedTeam.name} on ${slot.date}`);
            }
          }
          if (process.env.NODE_ENV !== 'production') {
            const completeCt = rounds.filter(r => r.length === halfN).length;
            const brokenCt = rounds.filter(r => r.length < halfN).length;
            console.log(`[phase0] filled ${phase0Count} partials, rounds: ${completeCt} complete + ${brokenCt} broken, leftover: ${leftover.length}`);
          }

          const scoreForSlot = (home: Team, away: Team, slot: DraftSlot): number => {
            const sfk = `${slot.fieldName}|${slot.fieldLocation}`;
            const sdow = new Date(slot.date + 'T00:00:00Z').getUTCDay();
            const sIsWeekday = sdow >= 1 && sdow <= 5;
            const sWeek = weekMonday(slot.date);
            let s = (gamesPerTeam.get(home.id) ?? 0) + (gamesPerTeam.get(away.id) ?? 0);
            if (config.evenHomeAway ?? true) s += (homeCount.get(home.id) ?? 0) + (awayCount.get(away.id) ?? 0);
            if (config.evenFields  ?? true) s += (fieldCount.get(home.id)?.get(sfk) ?? 0) + (fieldCount.get(away.id)?.get(sfk) ?? 0);
            if (config.evenTimes   ?? true) s += (timeCount.get(home.id)?.get(slot.time) ?? 0) + (timeCount.get(away.id)?.get(slot.time) ?? 0);
            if (config.evenRestDays ?? true) {
              for (const tid of [home.id, away.id]) {
                const last = teamLastGameDate.get(tid);
                if (!last) continue;
                const gap = Math.round(
                  (new Date(slot.date + 'T00:00:00Z').getTime() - new Date(last + 'T00:00:00Z').getTime()) / 86400000
                );
                if (gap >= 1 && gap <= 2) s += 4;
                else if (gap >= 3 && gap <= 4) s += 1;
              }
            }
            if (!sIsWeekday && config.minWeekendGamesPerWeek) {
              if ((weekendGamesPerTeamWeek.get(`${home.id}|${sWeek}`) ?? 0) >= config.minWeekendGamesPerWeek) s += 3;
              if ((weekendGamesPerTeamWeek.get(`${away.id}|${sWeek}`) ?? 0) >= config.minWeekendGamesPerWeek) s += 3;
            }
            return s;
          };

          // Phase 0.5: assign broken round matchups to the dates where Phase 0
          // pulled from them. This preserves the round's non-overlapping property
          // and prevents Phase 2 greedy from cross-contaminating dates.
          const completeRounds: Matchup[][] = [];
          const brokenMatchups: Matchup[] = [];
          let phase05Count = 0;
          for (let ri = 0; ri < rounds.length; ri++) {
            if (rounds[ri].length === halfN) {
              completeRounds.push(rounds[ri]);
              continue;
            }
            if (rounds[ri].length === 0) continue;
            const dates = phase0RoundDates.get(ri);
            if (!dates || dates.size !== 1) {
              brokenMatchups.push(...rounds[ri]);
              continue;
            }
            const targetDate = [...dates][0];
            const emptyOnDate: number[] = [];
            for (let i = 0; i < result.length; i++) {
              if (result[i].date === targetDate && !result[i].home && !result[i].away) emptyOnDate.push(i);
            }
            if (emptyOnDate.length === 0) {
              brokenMatchups.push(...rounds[ri]);
              continue;
            }
            const dow = new Date(targetDate + 'T00:00:00Z').getUTCDay() as DayRule['dayOfWeek'];
            const dayRule = config.dayRules.find(r => r.dayOfWeek === dow);
            const maxPD = (config.allowDoubleHeaders ?? false) ? (dayRule?.maxGamesPerTeamOnDay ?? 1) : 1;
            for (const m of rounds[ri]) {
              if (emptyOnDate.length === 0) { brokenMatchups.push(m); continue; }
              const dm = teamsPerDate.get(targetDate);
              if (dm && ((dm.get(m.home.id) ?? 0) >= maxPD || (dm.get(m.away.id) ?? 0) >= maxPD)) {
                brokenMatchups.push(m);
                continue;
              }
              let bestSi = -1, bestScore = Infinity, bestFlipped = false;
              for (const si of emptyOnDate) {
                const sA = scoreForSlot(m.home, m.away, result[si]);
                const sB = (config.evenHomeAway ?? true) ? scoreForSlot(m.away, m.home, result[si]) : sA;
                const best = Math.min(sA, sB);
                if (best < bestScore) { bestScore = best; bestSi = si; bestFlipped = sB < sA; }
              }
              if (bestSi === -1) { brokenMatchups.push(m); continue; }
              const matchup = bestFlipped ? { home: m.away, away: m.home } : m;
              result[bestSi] = { ...result[bestSi], home: matchup.home, away: matchup.away };
              emptyOnDate.splice(emptyOnDate.indexOf(bestSi), 1);
              updateTrackingMaps(matchup, result[bestSi]);
              phase05Count++;
            }
          }
          if (process.env.NODE_ENV !== 'production') {
            console.log(`[phase0.5] assigned ${phase05Count} broken-round matchups to partial dates, ${brokenMatchups.length} overflow to phase2`);
          }

          const uniqueDates = [...new Set(result.map(s => s.date))].sort();
          let roundIdx = 0;

          for (const date of uniqueDates) {
            if (roundIdx >= completeRounds.length) break;
            const emptyIdxs = result.reduce<number[]>((acc, s, i) => {
              if (s.date === date && !s.home && !s.away) acc.push(i);
              return acc;
            }, []);
            if (emptyIdxs.length !== halfN) continue;

            const round = completeRounds[roundIdx++];
            const openSlots = [...emptyIdxs];
            const remainingMatchups = round;

            for (const m of remainingMatchups) {
              let bestSi = -1, bestScore = Infinity, bestFlipped = false;
              for (const si of openSlots) {
                const sA = scoreForSlot(m.home, m.away, result[si]);
                const sB = (config.evenHomeAway ?? true)
                  ? scoreForSlot(m.away, m.home, result[si]) : sA;
                const best = Math.min(sA, sB);
                if (best < bestScore) { bestScore = best; bestSi = si; bestFlipped = sB < sA; }
              }
              if (bestSi === -1) continue;

              const matchup = bestFlipped ? { home: m.away, away: m.home } : m;
              result[bestSi] = { ...result[bestSi], home: matchup.home, away: matchup.away };
              openSlots.splice(openSlots.indexOf(bestSi), 1);
              updateTrackingMaps(matchup, result[bestSi]);
            }
          }

          // Rebuild pending from unused complete rounds + broken round matchups + leftover.
          pending.length = 0;
          for (let i = roundIdx; i < completeRounds.length; i++) {
            pending.push(...completeRounds[i]);
          }
          pending.push(...brokenMatchups);
          pending.push(...leftover);
        }

        // Phase 2: fill remaining empty slots (weekday dates, partial dates)
        // using the existing greedy with all constraint relaxation passes.
        result = result.map(slot => fillSlot(slot, true));
      } else {
        result = prev.map(slot => fillSlot(slot, false));
      }

      if (process.env.NODE_ENV !== 'production') {
        const counts = Object.fromEntries(
          teams.map(t => [t.name, gamesPerTeam.get(t.id) ?? 0])
        );
        const sorted = Object.entries(counts).sort((a, b) => a[1] - b[1]);
        const emptySlots = result.filter(s => !s.home || !s.away).length;
        const partials = result.filter(s => (s.home || s.away) && !(s.home && s.away)).length;
        const pendingLeft = pending.length;
        console.log('[auto-fill] game counts (asc):', sorted);
        console.log(`[auto-fill] empty slots: ${emptySlots}, partials: ${partials}, pending left: ${pendingLeft}`);
      }

      return result;
    });
    setAutoFillFeedback(relaxationCounts);
  }

  function handleExport() {
    const complete = slots.filter(s => s.home && s.away);
    if (complete.length === 0) return;

    const headers = ['Schedule Name', 'Home Team', 'Away Team', 'Game Date', 'Game Time', 'Location', 'Field'];
    const rows = complete.map(s => [
      s.fieldLocation,
      s.home!.name,
      s.away!.name,
      fmtDateTS(s.date),
      fmt12h(s.time),
      s.fieldLocation,
      s.fieldName,
    ].map(csvCell).join(','));

    const csv = [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'schedule-teamsideline.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
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

  useImperativeHandle(ref, () => ({
    autoFill: handleAutoFill,
    exportCsv: handleExport,
    commit: handleCommit,
  }));

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
        <p className="text-xs text-muted-foreground mt-1">Configure rules above and click &quot;Generate Slots →&quot; to begin scheduling.</p>
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
          {config.targetGamesPerTeam && teams.length > 0 && (() => {
            const needed = Math.ceil((teams.length * config.targetGamesPerTeam) / 2);
            const shortfall = needed - slots.length;
            if (shortfall <= 0) return null;
            return (
              <div className="px-2 pb-1.5 pt-0.5 border-t border-border">
                <div className="flex items-start gap-1 rounded p-1.5 bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                  <span className="text-[9px] leading-tight">
                    Need {needed} slots ({teams.length}×{config.targetGamesPerTeam}/2), have {slots.length}. Add {shortfall} more.
                  </span>
                </div>
              </div>
            );
          })()}
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

        </div>
      </div>

      <DragOverlay>
        {activeDrag ? <DraggingChip team={activeDrag.team} /> : null}
      </DragOverlay>
    </DndContext>
  );
});

// ─── Schedule Balance Report ────────────────────────────────────────────────────

const DAY_ORDER: Record<string, number> = {
  Monday: 0, Tuesday: 1, Wednesday: 2, Thursday: 3,
  Friday: 4, Saturday: 5, Sunday: 6,
};

function parseTimeSlotKey(key: string): number {
  const commaIdx = key.indexOf(', ');
  if (commaIdx === -1) return 9999;
  const dayPart  = key.slice(0, commaIdx);
  const timePart = key.slice(commaIdx + 2); // "h:mm AM/PM"
  const dayIdx   = DAY_ORDER[dayPart] ?? 7;
  const [timeStr, meridiem] = timePart.split(' ');
  const [hStr, mStr] = timeStr.split(':');
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (meridiem === 'PM' && h !== 12) h += 12;
  if (meridiem === 'AM' && h === 12) h = 0;
  return dayIdx * 10000 + h * 60 + m;
}

interface TeamStats {
  team: Team;
  total: number;
  home:      { total: number; fields: Map<string, number>; times: Map<string, number> };
  away:      { total: number; fields: Map<string, number>; times: Map<string, number> };
  season:    { total: number; fields: Map<string, number>; times: Map<string, number> };
  allFields: string[]; // sorted union, alphabetical
  allTimes:  string[]; // sorted union, Mon→Sun then chronological
}

interface ScorecardRow {
  team: Team;
  gamesActual:    number;
  homeCount:      number;
  awayCount:      number;
  gamesRating:    'green' | 'amber' | 'red';
  homeAwayRating: 'green' | 'amber' | 'red';
  fieldRating:    'green' | 'amber' | 'red';
  timeRating:     'green' | 'amber' | 'red';
  oppRating:      'green' | 'amber' | 'red';
}
interface TimelineRow { team: Team; games: { date: string; isHome: boolean }[]; }
interface RestDaysRow  { team: Team; gaps: number[]; buckets: { label: string; count: number; color: string }[]; }

function StatBlock({ label, keys, counts }: {
  label: string;
  keys: string[];
  counts: Map<string, number>;
}) {
  if (keys.length === 0) return null;
  return (
    <div>
      <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-1">{label}</div>
      <div className="space-y-0.5">
        {keys.map(key => {
          const count = counts.get(key) ?? 0;
          return (
            <div key={key} className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-muted-foreground truncate">{key}</span>
              <span className={cn(
                "text-[11px] tabular-nums shrink-0",
                count === 0 ? "text-muted-foreground/30" : "font-semibold"
              )}>
                {count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RatingDot({ r }: { r: 'green' | 'amber' | 'red' }) {
  return (
    <span className={cn(
      "inline-block w-2 h-2 rounded-full",
      r === 'green' ? "bg-green-500" : r === 'amber' ? "bg-amber-400" : "bg-red-500"
    )} />
  );
}

function abbrevTeam(name: string): string {
  const words = name.trim().split(/\s+/);
  return words.length > 1 ? words[words.length - 1].slice(0, 9) : name.slice(0, 9);
}

function matrixCellStyle(count: number, maxAllowed: number): { className: string } {
  if (count === 0) return { className: "text-muted-foreground/30" };
  if (count > maxAllowed) return { className: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30" };
  const t = maxAllowed > 1 ? (count - 1) / (maxAllowed - 1) : 0;
  if (t <= 0) return { className: "text-foreground" };
  if (t <= 0.5) return { className: "text-blue-600 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/30" };
  return { className: "text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/30" };
}

function ScheduleReport({ slots, teams, config }: {
  slots: DraftSlot[];
  teams: Team[];
  config: ScheduleConfig;
}) {
  const [reportView, setReportView] = useState<'breakdown' | 'scorecard' | 'timeline' | 'matrix' | 'restdays'>('breakdown');
  const hasGames = slots.some(s => s.home && s.away);

  // ── Breakdown stats ──────────────────────────────────────────────────────────
  const stats = useMemo<TeamStats[]>(() => {
    return teams.map(team => {
      const homeSlots = slots.filter(s => s.home?.id === team.id && !!s.away);
      const awaySlots = slots.filter(s => s.away?.id === team.id && !!s.home);

      function breakdown(ss: DraftSlot[]) {
        const fields = new Map<string, number>();
        const times  = new Map<string, number>();
        for (const s of ss) {
          const fk = [s.fieldLocation, s.fieldName].filter(Boolean).join(' · ') || '(no location)';
          const dow = new Date(s.date + 'T00:00:00Z').getUTCDay();
          const tk  = `${DAY_FULL[dow]}, ${fmt12h(s.time)}`;
          fields.set(fk, (fields.get(fk) ?? 0) + 1);
          times.set(tk,  (times.get(tk)  ?? 0) + 1);
        }
        return { total: ss.length, fields, times };
      }

      const home   = breakdown(homeSlots);
      const away   = breakdown(awaySlots);
      const season = breakdown([...homeSlots, ...awaySlots]);

      const allFields = [...season.fields.keys()].sort();
      const allTimes  = [...season.times.keys()].sort(
        (a, b) => parseTimeSlotKey(a) - parseTimeSlotKey(b)
      );

      return { team, total: homeSlots.length + awaySlots.length, home, away, season, allFields, allTimes };
    });
  }, [slots, teams]);

  // ── Fairness stats ────────────────────────────────────────────────────────────
  const fairness = useMemo(() => {
    const done = slots.filter(s => s.home && s.away);
    const target = config.targetGamesPerTeam;
    const avgGames = teams.length > 0 ? (done.length * 2) / teams.length : 0;

    function daysBetween(d1: string, d2: string): number {
      return Math.round(Math.abs(
        new Date(d2 + 'T00:00:00Z').getTime() -
        new Date(d1 + 'T00:00:00Z').getTime()
      ) / 86400000);
    }

    function tl(diff: number, green: number, amber: number): 'green' | 'amber' | 'red' {
      return diff <= green ? 'green' : diff <= amber ? 'amber' : 'red';
    }

    // Global field/time totals for deviation-from-average metrics
    const globalFieldCount = new Map<string, number>();
    const globalTimeCount = new Map<string, number>();
    for (const s of done) {
      const fk = [s.fieldLocation, s.fieldName].filter(Boolean).join(' · ') || '(no location)';
      globalFieldCount.set(fk, (globalFieldCount.get(fk) ?? 0) + 1);
      const dow = new Date(s.date + 'T00:00:00Z').getUTCDay();
      const tk = `${DAY_FULL[dow]}, ${fmt12h(s.time)}`;
      globalTimeCount.set(tk, (globalTimeCount.get(tk) ?? 0) + 1);
    }
    const numTeams = teams.length;

    // Scorecard
    const scorecard: ScorecardRow[] = teams.map(team => {
      const allGames  = done.filter(s => s.home!.id === team.id || s.away!.id === team.id);
      const homeCount = done.filter(s => s.home!.id === team.id).length;
      const awayCount = allGames.length - homeCount;
      const gamesActual = allGames.length;
      const idealGames  = target ?? avgGames;

      const fieldMap = new Map<string, number>();
      const timeMap  = new Map<string, number>();
      for (const s of allGames) {
        const fk = [s.fieldLocation, s.fieldName].filter(Boolean).join(' · ') || '(no location)';
        fieldMap.set(fk, (fieldMap.get(fk) ?? 0) + 1);
        const dow = new Date(s.date + 'T00:00:00Z').getUTCDay();
        const tk  = `${DAY_FULL[dow]}, ${fmt12h(s.time)}`;
        timeMap.set(tk, (timeMap.get(tk) ?? 0) + 1);
      }
      let fieldSpread = 0;
      for (const [fk, total] of globalFieldCount) {
        const avg = (total * 2) / numTeams;
        fieldSpread = Math.max(fieldSpread, Math.abs((fieldMap.get(fk) ?? 0) - avg));
      }
      let timeSpread = 0;
      for (const [tk, total] of globalTimeCount) {
        const avg = (total * 2) / numTeams;
        timeSpread = Math.max(timeSpread, Math.abs((timeMap.get(tk) ?? 0) - avg));
      }

      const opponents = new Set<number>();
      for (const s of done) {
        if (s.home!.id === team.id) opponents.add(s.away!.id);
        else if (s.away!.id === team.id) opponents.add(s.home!.id);
      }
      const missingOpp = (teams.length - 1) - opponents.size;

      return {
        team, gamesActual, homeCount, awayCount,
        gamesRating:    tl(Math.abs(gamesActual - idealGames), 0, 1),
        homeAwayRating: tl(Math.abs(homeCount - awayCount), 1, 2),
        fieldRating:    tl(fieldSpread, 1.5, 3),
        timeRating:     tl(timeSpread, 1.5, 3),
        oppRating:      tl(missingOpp, 0, 1),
      };
    });

    // Timeline
    const timeline: TimelineRow[] = teams.map(team => ({
      team,
      games: done
        .filter(s => s.home!.id === team.id || s.away!.id === team.id)
        .map(s => ({ date: s.date, isHome: s.home!.id === team.id }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    }));

    // Head-to-Head Matrix
    const n = teams.length;
    const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
    const idxMap = new Map(teams.map((t, i) => [t.id, i]));
    for (const s of done) {
      const hi = idxMap.get(s.home!.id)!, ai = idxMap.get(s.away!.id)!;
      if (hi !== undefined && ai !== undefined) {
        matrix[hi][ai]++;
        matrix[ai][hi]++;
      }
    }

    // Rest Days
    const restDays: RestDaysRow[] = teams.map(team => {
      const uniqueDates = [...new Set(
        done.filter(s => s.home!.id === team.id || s.away!.id === team.id).map(s => s.date)
      )].sort();
      const gaps: number[] = [];
      for (let i = 1; i < uniqueDates.length; i++) gaps.push(daysBetween(uniqueDates[i - 1], uniqueDates[i]));
      return {
        team, gaps,
        buckets: [
          { label: '1d',   count: gaps.filter(g => g <= 2).length,            color: 'bg-red-500'   },
          { label: '2–3d', count: gaps.filter(g => g >= 3 && g <= 4).length,  color: 'bg-amber-400' },
          { label: '4+d',  count: gaps.filter(g => g >= 5).length,            color: 'bg-green-500' },
        ],
      };
    });

    const allDates = [...new Set(done.map(s => s.date))].sort();

    const maxAllowedMatchups = teams.length > 1 && config.targetGamesPerTeam
      ? Math.ceil(config.targetGamesPerTeam / (teams.length - 1))
      : config.maxRepeatMatchups ?? 2;

    return { scorecard, timeline, matrixTeams: teams, matrix, restDays, allDates, maxAllowedMatchups };
  }, [slots, teams, config.targetGamesPerTeam, config.maxRepeatMatchups]);

  if (!hasGames) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border" style={{ fontFamily: 'var(--font-body)' }}>
        <p className="text-sm font-medium text-muted-foreground">No games assigned yet</p>
        <p className="text-xs text-muted-foreground mt-1">Switch to Workspace and run Auto-fill or assign teams manually.</p>
      </div>
    );
  }

  const REPORT_TABS = [
    { key: 'breakdown' as const, label: 'Breakdown'    },
    { key: 'scorecard' as const, label: 'Scorecard'    },
    { key: 'timeline'  as const, label: 'Timeline'     },
    { key: 'matrix'    as const, label: 'Head-to-Head' },
    { key: 'restdays'  as const, label: 'Rest Days'    },
  ];

  return (
    <div style={{ fontFamily: 'var(--font-body)' }}>
      {/* Secondary tab bar */}
      <div className="flex gap-0 mb-4 border-b border-border overflow-x-auto">
        {REPORT_TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setReportView(key)}
            className={cn(
              "px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] border-b-2 -mb-px transition-colors whitespace-nowrap",
              reportView === key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Breakdown ──────────────────────────────────────────────────────────── */}
      {reportView === 'breakdown' && (
        <div className="space-y-3">
          {stats.map(({ team, total, home, away, season, allFields, allTimes }) => (
            <div key={team.id} className="border border-border">
              <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em]">{team.name}</span>
                <span className="text-[11px] text-muted-foreground">{total}g total</span>
              </div>
              <div className="grid grid-cols-3 divide-x divide-border">
                <div className="p-3 space-y-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-primary">Home — {home.total}g</div>
                  <StatBlock label="Fields" keys={allFields} counts={home.fields} />
                  <StatBlock label="Time Slots" keys={allTimes} counts={home.times} />
                </div>
                <div className="p-3 space-y-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Away — {away.total}g</div>
                  <StatBlock label="Fields" keys={allFields} counts={away.fields} />
                  <StatBlock label="Time Slots" keys={allTimes} counts={away.times} />
                </div>
                <div className="p-3 space-y-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-foreground">Full Season — {season.total}g</div>
                  <StatBlock label="Fields" keys={allFields} counts={season.fields} />
                  <StatBlock label="Time Slots" keys={allTimes} counts={season.times} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Scorecard ──────────────────────────────────────────────────────────── */}
      {reportView === 'scorecard' && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Team</th>
                <th className="text-center px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  <div>Games</div>
                  <div className="text-[8px] font-normal normal-case tracking-normal text-muted-foreground/60">Target vs actual</div>
                </th>
                <th className="text-center px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  <div>H / A Split</div>
                  <div className="text-[8px] font-normal normal-case tracking-normal text-muted-foreground/60">Home vs away balance</div>
                </th>
                <th className="text-center px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  <div>Field Spread</div>
                  <div className="text-[8px] font-normal normal-case tracking-normal text-muted-foreground/60">Deviation from avg field usage</div>
                </th>
                <th className="text-center px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  <div>Time Spread</div>
                  <div className="text-[8px] font-normal normal-case tracking-normal text-muted-foreground/60">Deviation from avg time-slot usage</div>
                </th>
                <th className="text-center px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  <div>Opponents</div>
                  <div className="text-[8px] font-normal normal-case tracking-normal text-muted-foreground/60">Teams not yet played</div>
                </th>
              </tr>
            </thead>
            <tbody>
              {fairness.scorecard.map(row => (
                <tr key={row.team.id} className="border-b border-border/50 hover:bg-muted/20">
                  <td className="px-3 py-2 font-medium">{row.team.name}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col items-center gap-1">
                      <RatingDot r={row.gamesRating} />
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {row.gamesActual}{config.targetGamesPerTeam ? `/${config.targetGamesPerTeam}` : ''}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col items-center gap-1">
                      <RatingDot r={row.homeAwayRating} />
                      <span className="text-[10px] text-muted-foreground tabular-nums">{row.homeCount}H / {row.awayCount}A</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center"><RatingDot r={row.fieldRating} /></td>
                  <td className="px-3 py-2 text-center"><RatingDot r={row.timeRating} /></td>
                  <td className="px-3 py-2 text-center"><RatingDot r={row.oppRating} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-4 mt-3 px-3">
            {(['green', 'amber', 'red'] as const).map(r => (
              <div key={r} className="flex items-center gap-1.5">
                <RatingDot r={r} />
                <span className="text-[10px] text-muted-foreground">
                  {r === 'green' ? 'Fair' : r === 'amber' ? 'Acceptable' : 'Imbalanced'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Timeline ───────────────────────────────────────────────────────────── */}
      {reportView === 'timeline' && (
        <div className="overflow-x-auto">
          <table className="border-separate border-spacing-0 text-[11px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-background border-b border-r border-border px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground min-w-[120px]">Team</th>
                {fairness.allDates.map(d => {
                  const [, m, day] = d.split('-');
                  return (
                    <th key={d} className="border-b border-border px-0.5 py-1.5 text-[9px] text-muted-foreground font-medium min-w-[20px] text-center whitespace-nowrap">
                      {parseInt(m)}/{parseInt(day)}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {fairness.timeline.map(row => {
                const gamesByDate = new Map(row.games.map(g => [g.date, g.isHome]));
                return (
                  <tr key={row.team.id}>
                    <td className="sticky left-0 z-10 bg-background border-r border-border px-3 py-1.5 font-medium whitespace-nowrap border-b border-border/30">{row.team.name}</td>
                    {fairness.allDates.map(d => {
                      const isHome = gamesByDate.get(d);
                      return (
                        <td key={d} className="py-1.5 text-center border-b border-border/30">
                          {isHome !== undefined ? (
                            <span
                              className={cn(
                                "inline-block w-2.5 h-2.5 rounded-full",
                                isHome ? "bg-primary" : "bg-muted-foreground/50"
                              )}
                              title={isHome ? 'Home' : 'Away'}
                            />
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex gap-4 mt-3 px-1">
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-primary" />
              <span className="text-[10px] text-muted-foreground">Home</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-muted-foreground/50" />
              <span className="text-[10px] text-muted-foreground">Away</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Head-to-Head Matrix ────────────────────────────────────────────────── */}
      {reportView === 'matrix' && (
        <div className="overflow-x-auto">
          <table className="border-collapse text-[11px]">
            <thead>
              <tr>
                <th className="min-w-[140px]" />
                {fairness.matrixTeams.map(t => (
                  <th key={t.id} className="border border-border/50 p-0 w-8 min-w-[2rem]">
                    <div className="flex items-end justify-center h-20 pb-1">
                      <span
                        className="text-[11px] font-medium text-foreground whitespace-nowrap"
                        style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                      >
                        {abbrevTeam(t.name)}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fairness.matrixTeams.map((rowTeam, i) => (
                <tr key={rowTeam.id}>
                  <td className="px-2 py-1 text-right whitespace-nowrap border-r border-border/50 text-[11px] font-medium text-foreground">{rowTeam.name}</td>
                  {fairness.matrixTeams.map((colTeam, j) => {
                    if (i === j) return <td key={j} className="border border-border/50 bg-muted/40 w-8 h-7" />;
                    const count = fairness.matrix[i][j];
                    return (
                      <td
                        key={j}
                        className={cn("border border-border/50 w-8 h-7 text-center tabular-nums font-semibold", matrixCellStyle(count, fairness.maxAllowedMatchups).className)}
                        title={`${rowTeam.name} vs ${colTeam.name}: ${count} game${count !== 1 ? 's' : ''}`}
                      >
                        {count > 0 ? count : ''}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-4 mt-3 text-[10px] text-muted-foreground items-center">
            {Array.from({ length: fairness.maxAllowedMatchups }, (_, i) => i + 1).map(n => (
              <div key={n} className="flex items-center gap-1.5">
                <span className={cn("inline-flex w-5 h-5 border border-border/50 items-center justify-center text-[9px] font-semibold", matrixCellStyle(n, fairness.maxAllowedMatchups).className)}>{n}</span>
                <span>{n} game{n !== 1 ? 's' : ''}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <span className={cn("inline-flex w-5 h-5 border border-border/50 items-center justify-center text-[9px] font-semibold", matrixCellStyle(fairness.maxAllowedMatchups + 1, fairness.maxAllowedMatchups).className)}>{fairness.maxAllowedMatchups + 1}</span>
              <span>{fairness.maxAllowedMatchups + 1}+ over limit</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Rest Days ──────────────────────────────────────────────────────────── */}
      {reportView === 'restdays' && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-4 px-1 mb-3">
            {[
              { label: '1d  Back-to-back', color: 'bg-red-500'   },
              { label: '2–3d  Short rest', color: 'bg-amber-400' },
              { label: '4+d  Good rest',   color: 'bg-green-500' },
            ].map(b => (
              <div key={b.label} className="flex items-center gap-1.5">
                <span className={cn("inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0", b.color)} />
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">{b.label}</span>
              </div>
            ))}
          </div>
          {fairness.restDays.map(row => (
            <div key={row.team.id} className="border border-border flex items-end gap-4 px-4 py-3">
              <span className="text-[11px] font-medium min-w-[120px] self-center">{row.team.name}</span>
              <div className="flex items-end gap-4 flex-1">
                {row.buckets.map(b => (
                  <div key={b.label} className="flex flex-col items-center gap-0.5">
                    <span className="text-[10px] font-semibold tabular-nums min-h-[14px]">
                      {b.count > 0 ? b.count : ''}
                    </span>
                    <div
                      className={cn("w-6 rounded-sm transition-all", b.color)}
                      style={{ height: `${Math.max(4, b.count * 10)}px`, opacity: b.count === 0 ? 0.15 : 1 }}
                    />
                    <span className="text-[9px] text-muted-foreground mt-0.5">{b.label}</span>
                  </div>
                ))}
              </div>
              {row.buckets[0].count > 0 && (
                <span className="text-[10px] text-red-500 font-medium self-center ml-2">
                  {row.buckets[0].count} short rest{row.buckets[0].count !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
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
  const [activeView, setActiveView] = useState<'workspace' | 'report'>('workspace');
  const [committing, setCommitting] = useState(false);
  const [commitMode, setCommitMode] = useState<'add' | 'replace'>('add');
  const [existingCount, setExistingCount] = useState<number | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [commitSuccess, setCommitSuccess] = useState(false);
  const [autoFillFeedback, setAutoFillFeedback] = useState<{
    restDays: number; backToBack: number; roundCompletion: number; weekdayLimit: number;
  } | null>(null);

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

  const workspaceRef = useRef<WorkspaceHandle>(null);

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
    setAutoFillFeedback(null);
  }

  const ws = workspaceRef.current;
  const assignedCount = slots.filter(s => s.home && s.away).length;

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
          saving={saving}
        />
      )}

      {/* Action toolbar */}
      {canEdit && (
        <div className="flex items-center justify-between flex-wrap gap-3 my-4 py-3 px-4 border border-border bg-muted/20">
          <div className="flex items-center gap-2">
            <button type="button" onClick={handleGenerateSlots}
              className={cn(BTN, "bg-primary text-primary-foreground border-primary hover:opacity-90")}>
              Generate Slots &rarr;
            </button>
            {slots.length > 0 && (
              <button type="button" onClick={() => ws?.autoFill()}
                className={cn(BTN, "border-border text-muted-foreground hover:border-primary hover:text-primary")}>
                <Wand2 className="h-3 w-3" /> Auto-fill
              </button>
            )}
          </div>
          {slots.length > 0 && (
            <div className="flex items-center gap-3 flex-wrap">
              {commitError && (
                <p className="text-xs text-destructive flex items-center gap-1.5">
                  <AlertTriangle className="h-3 w-3" /> {commitError}
                </p>
              )}
              {commitSuccess && (
                <span className="text-[11px] text-green-600 dark:text-green-400 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Committed
                </span>
              )}
              {existingCount !== null && existingCount > 0 && (
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-amber-700 dark:text-amber-300">
                    {existingCount} existing
                  </span>
                  {(['add', 'replace'] as const).map(m => (
                    <label key={m} className="flex items-center gap-1.5 text-[11px] cursor-pointer">
                      <input type="radio" name="commit-mode" value={m} checked={commitMode === m}
                        onChange={() => setCommitMode(m)} className="accent-primary" />
                      {m === 'add' ? 'Add' : 'Replace'}
                    </label>
                  ))}
                </div>
              )}
              <button type="button"
                onClick={() => { setSlots(prev => prev.map(s => ({ ...s, home: null, away: null }))); setAutoFillFeedback(null); }}
                className={cn(BTN, "border-border text-muted-foreground hover:border-foreground hover:text-foreground text-[10px]")}>
                Clear All
              </button>
              <button type="button" onClick={() => ws?.exportCsv()}
                disabled={assignedCount === 0}
                className={cn(BTN, "border-border text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-40")}>
                <Download className="h-3.5 w-3.5" /> Export CSV
              </button>
              <button type="button" onClick={() => ws?.commit()}
                disabled={committing || assignedCount === 0}
                className={cn(BTN, "bg-primary text-primary-foreground border-primary hover:opacity-90 disabled:opacity-50")}>
                <CalendarCheck className="h-3.5 w-3.5" />
                {committing ? 'Committing…' : `Commit ${assignedCount} Game${assignedCount !== 1 ? 's' : ''}`}
              </button>
            </div>
          )}
        </div>
      )}

      {autoFillFeedback && Object.values(autoFillFeedback).some(v => v > 0) && (
        <div className="flex items-center gap-2 my-2 px-3 py-2 text-[10px] text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>
            <span className="font-semibold">Rules relaxed to fill slots:</span>
            {autoFillFeedback.restDays > 0 && ` ${autoFillFeedback.restDays} short-rest`}
            {autoFillFeedback.backToBack > 0 && `${autoFillFeedback.restDays > 0 ? ',' : ''} ${autoFillFeedback.backToBack} back-to-back`}
            {autoFillFeedback.roundCompletion > 0 && `${(autoFillFeedback.restDays + autoFillFeedback.backToBack) > 0 ? ',' : ''} ${autoFillFeedback.roundCompletion} round-completion`}
            {autoFillFeedback.weekdayLimit > 0 && `${(autoFillFeedback.restDays + autoFillFeedback.backToBack + autoFillFeedback.roundCompletion) > 0 ? ',' : ''} ${autoFillFeedback.weekdayLimit} weekday-limit`}
          </span>
        </div>
      )}

      {slots.length > 0 && (
        <div className="flex gap-0 mb-4 border-b border-border">
          {(['workspace', 'report'] as const).map(v => (
            <button
              key={v}
              type="button"
              onClick={() => setActiveView(v)}
              className={cn(
                "px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] border-b-2 -mb-px transition-colors",
                activeView === v
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {v === 'workspace' ? 'Workspace' : 'Balance Report'}
            </button>
          ))}
        </div>
      )}

      {activeView === 'workspace' || slots.length === 0
        ? <SchedulerWorkspace
            ref={workspaceRef}
            slots={slots}
            setSlots={setSlots}
            teams={teams}
            seasonId={seasonId!}
            config={config}
            committing={committing}
            setCommitting={setCommitting}
            commitMode={commitMode}
            existingCount={existingCount}
            setExistingCount={setExistingCount}
            commitError={commitError}
            setCommitError={setCommitError}
            commitSuccess={commitSuccess}
            setCommitSuccess={setCommitSuccess}
            setAutoFillFeedback={setAutoFillFeedback}
          />
        : <ScheduleReport slots={slots} teams={teams} config={config} />
      }
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
