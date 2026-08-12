// components/seasons/ManualGameWizard.tsx
//
// Click-driven replacement for the manual scheduler's drag-and-drop board.
// Instead of dragging a venue chip, a date cell, a time chip and two team chips
// onto a slot card, the admin makes five single-click choices in sequence:
//
//   Away team → Home team → Date → Time → Venue · Field
//
// Each click lands the value and advances. On the last step the wizard stays
// open so the admin can choose between committing one game and committing then
// starting another (a fresh blank run — nothing carries forward).
//
// The same component doubles as the single-field editor: opening it in 'edit'
// mode shows exactly one step, commits that one value, and closes.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, MapPin, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { DAY_FULL, HOUR_GROUPS, buildMonthGrid, fmt12h, shiftMonth } from "@/lib/scheduling/timeGrid";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import LocationPicker from "@/components/LocationPicker";
import type { LocationPickerValue } from "@/components/LocationPicker";
import type { Team } from "@/lib/auto-schedule";
import type { VenueDTO } from "@/components/venues/types";
import { TBD_FIELD } from "@/components/venues/types";

export type WizardStep = 'away' | 'home' | 'date' | 'time' | 'venue';

/**
 * Exactly `Omit<ManualSlot, 'id'>`. The caller mints the id and asserts the
 * assignment, so adding a field to ManualSlot fails the build here rather than
 * silently dropping it.
 */
export type GameDraft = {
  date: string;
  time: string;
  fieldName: string;
  fieldLocation: string;
  locationId: number | null;
  seasonVenueId: number | null;
  homeId: number | null;
  awayId: number | null;
};

export const BLANK_DRAFT: GameDraft = {
  date: '', time: '', fieldName: '', fieldLocation: '',
  locationId: null, seasonVenueId: null, homeId: null, awayId: null,
};

/** null = closed. One piece of parent state drives open + mode + seeding. */
export type WizardMode =
  | { kind: 'create' }
  | { kind: 'edit'; slotId: string; step: WizardStep; draft: GameDraft };

const STEP_ORDER: WizardStep[] = ['away', 'home', 'date', 'time', 'venue'];
const NEXT_STEP: Record<WizardStep, WizardStep | null> = {
  away: 'home', home: 'date', date: 'time', time: 'venue', venue: null,
};
const PREV_STEP: Record<WizardStep, WizardStep | null> = {
  away: null, home: 'away', date: 'home', time: 'date', venue: 'time',
};

const STEP_LABEL: Record<WizardStep, string> = {
  away: 'Away team', home: 'Home team', date: 'Date', time: 'Time', venue: 'Venue · Field',
};
const STEP_SHORT: Record<WizardStep, string> = {
  away: 'Away', home: 'Home', date: 'Date', time: 'Time', venue: 'Venue',
};
const STEP_PROMPT: Record<WizardStep, string> = {
  away: 'Which team is away?',
  home: 'Which team is home?',
  date: 'Which day?',
  time: 'What time?',
  venue: 'Which venue and field?',
};

const TILE =
  "flex items-center justify-center text-center min-h-[52px] px-3 py-2 rounded-md border border-border bg-background text-sm font-medium transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/40";
const TILE_ON = "border-primary bg-primary/10 text-primary";
const BTN =
  "inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] border transition-colors disabled:opacity-40 disabled:pointer-events-none";

/**
 * Same rule the board and publish use: a slot has a venue when a season venue is
 * picked, or — when the season has no venues configured — when a location was
 * typed into the fallback picker. Duplicated rather than exported from the page
 * module, which Next's Pages Router treats as a route.
 */
function draftHasVenue(d: GameDraft): boolean {
  return d.seasonVenueId != null || !!d.fieldLocation.trim();
}

function isComplete(d: GameDraft): boolean {
  return d.awayId != null && d.homeId != null && !!d.date && !!d.time && draftHasVenue(d);
}

function longDateLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return `${DAY_FULL[d.getUTCDay()].slice(0, 3)} ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`;
}

/** Opening calendar month: the draft's own date, else the season's first game, else today. */
function initialMonth(draftDate: string, firstGameDate?: string): { y: number; m: number } {
  const seed = draftDate || firstGameDate || '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(seed)) {
    return { y: Number(seed.slice(0, 4)), m: Number(seed.slice(5, 7)) - 1 };
  }
  const now = new Date();
  return { y: now.getUTCFullYear(), m: now.getUTCMonth() };
}

export default function ManualGameWizard({
  mode, onClose, onCreate, onEdit, teams, venues, seasonId, firstGameDate,
}: {
  mode: WizardMode | null;
  onClose: () => void;
  /** Create-mode commit. `again` = "Add game & start another". */
  onCreate: (draft: GameDraft, again: boolean) => void;
  /** Edit-mode commit — a single-field patch, applied then closed. */
  onEdit: (slotId: string, patch: Partial<GameDraft>) => void;
  teams: Team[];
  venues: VenueDTO[] | null;
  seasonId: number;
  firstGameDate?: string;
}) {
  const editing = mode?.kind === 'edit';
  const [draft, setDraft] = useState<GameDraft>(() => (mode?.kind === 'edit' ? mode.draft : BLANK_DRAFT));
  const [step, setStep] = useState<WizardStep>(() => (mode?.kind === 'edit' ? mode.step : 'away'));
  const [teamFilter, setTeamFilter] = useState('');
  const [cal, setCal] = useState(() =>
    initialMonth(mode?.kind === 'edit' ? mode.draft.date : '', firstGameDate)
  );
  const panelRef = useRef<HTMLDivElement | null>(null);

  const teamName = (id: number | null) => (id == null ? '' : teams.find(t => t.id === id)?.name ?? `Team ${id}`);

  // A team step's own filter shouldn't leak into the next step, and non-team
  // steps take focus on the panel so the step heading stays in the reading order.
  useEffect(() => {
    setTeamFilter('');
    if (step !== 'away' && step !== 'home') panelRef.current?.focus();
  }, [step]);

  // Bring the selected (or mid-morning) hour into view when the time step opens,
  // otherwise a 10 AM game means scrolling past four hours of chips.
  useEffect(() => {
    if (step !== 'time') return;
    panelRef.current?.querySelector('[data-scroll-anchor="true"]')
      ?.scrollIntoView({ block: 'center' });
  }, [step]);

  if (!mode) return null;

  /** Land a value: in edit mode commit + close, in create mode advance. */
  function choose(patch: Partial<GameDraft>) {
    if (mode?.kind === 'edit') {
      onEdit(mode.slotId, patch);
      onClose();
      return;
    }
    setDraft(d => ({ ...d, ...patch }));
    const next = NEXT_STEP[step];
    // On 'venue' we deliberately stay put — the footer's two Add buttons take over.
    if (next) setStep(next);
  }

  const stepIndex = STEP_ORDER.indexOf(step);
  const complete = isComplete(draft);

  const venueLabel = (d: GameDraft) => {
    if (!draftHasVenue(d)) return '';
    const venue = d.fieldLocation || '';
    if (!d.fieldName) return venue;
    return d.fieldName === TBD_FIELD ? `${venue} · TBD` : `${venue} · ${d.fieldName}`;
  };

  const stepValue: Record<WizardStep, string> = {
    away: teamName(draft.awayId),
    home: teamName(draft.homeId),
    date: draft.date ? longDateLabel(draft.date) : '',
    time: draft.time ? fmt12h(draft.time) : '',
    venue: venueLabel(draft),
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent size="full" className="p-0" style={{ fontFamily: 'var(--font-body)' }}>
        <div className="p-6 pb-4">
          <DialogHeader>
            <DialogTitle>{editing ? `Change ${STEP_LABEL[step].toLowerCase()}` : 'Add game'}</DialogTitle>
            <DialogDescription>
              {editing
                ? `${draft.awayId != null || draft.homeId != null
                    ? `${teamName(draft.awayId) || 'TBD'} at ${teamName(draft.homeId) || 'TBD'} — `
                    : ''}${STEP_PROMPT[step]}`
                : `Step ${stepIndex + 1} of 5 — ${STEP_PROMPT[step].toLowerCase()}`}
            </DialogDescription>
          </DialogHeader>

          {/* Stepper — every step is reachable, so a carried or mistaken value is
              one click from being changed. Commit stays gated on isComplete(). */}
          {!editing && (
            <nav aria-label="Game steps" className="mt-4 flex items-stretch gap-1.5 flex-wrap">
              {STEP_ORDER.map((s, i) => {
                const active = s === step;
                const value = stepValue[s];
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStep(s)}
                    aria-current={active ? 'step' : undefined}
                    aria-label={`${STEP_SHORT[s]}: ${value || 'not set'}`}
                    className={cn(
                      "flex-1 min-w-[110px] flex items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-colors",
                      active
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/60"
                    )}
                  >
                    <span className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                      value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    )}>
                      {i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        {STEP_SHORT[s]}
                      </span>
                      <span className={cn(
                        "block truncate text-xs",
                        value ? "font-medium text-foreground" : "text-muted-foreground"
                      )}>
                        {value || '—'}
                      </span>
                    </span>
                  </button>
                );
              })}
            </nav>
          )}
        </div>

        {/* Step panel */}
        <div
          ref={panelRef}
          tabIndex={-1}
          className="px-6 pb-2 outline-none max-h-[52vh] overflow-y-auto"
        >
          <p aria-live="polite" className="sr-only">
            {editing ? STEP_LABEL[step] : `Step ${stepIndex + 1} of 5: ${STEP_LABEL[step]}`}
          </p>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
            {step === 'away' || step === 'home' ? <Users className="h-4 w-4 text-primary" />
              : step === 'date' ? <CalendarDays className="h-4 w-4 text-primary" />
              : step === 'time' ? <Clock className="h-4 w-4 text-primary" />
              : <MapPin className="h-4 w-4 text-primary" />}
            {STEP_PROMPT[step]}
          </h3>

          {(step === 'away' || step === 'home') && (
            <TeamStep
              position={step}
              teams={teams}
              draft={draft}
              filter={teamFilter}
              setFilter={setTeamFilter}
              onPick={choose}
            />
          )}

          {step === 'date' && (
            <DateStep value={draft.date} cal={cal} setCal={setCal} onPick={d => choose({ date: d })} />
          )}

          {step === 'time' && (
            <TimeStep value={draft.time} onPick={t => choose({ time: t })} />
          )}

          {step === 'venue' && (
            <VenueStep
              draft={draft}
              venues={venues}
              seasonId={seasonId}
              onPick={choose}
              onFreeText={(patch) => setDraft(d => ({ ...d, ...patch }))}
              editing={editing}
              onCommitFreeText={() => {
                if (mode?.kind === 'edit') {
                  onEdit(mode.slotId, {
                    fieldLocation: draft.fieldLocation, fieldName: draft.fieldName,
                    locationId: draft.locationId, seasonVenueId: draft.seasonVenueId,
                  });
                  onClose();
                }
              }}
            />
          )}
        </div>

        <DialogFooter className="border-t border-border px-6 py-4 sm:justify-between items-center">
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose}
              className={cn(BTN, "border-border text-muted-foreground hover:border-foreground hover:text-foreground")}>
              Cancel
            </button>
            {!editing && (
              <button type="button" onClick={() => { const p = PREV_STEP[step]; if (p) setStep(p); }}
                disabled={!PREV_STEP[step]}
                className={cn(BTN, "border-border text-muted-foreground hover:border-foreground hover:text-foreground")}>
                <ChevronLeft className="h-3.5 w-3.5" /> Back
              </button>
            )}
          </div>

          {!editing && (
            step === 'venue' ? (
              <div className="flex items-center gap-2 flex-wrap">
                <button type="button" onClick={() => onCreate(draft, true)} disabled={!complete}
                  title={complete ? undefined : 'Fill in every step first'}
                  className={cn(BTN, "border-primary text-primary hover:bg-primary/10")}>
                  Add game &amp; start another
                </button>
                <button type="button" onClick={() => onCreate(draft, false)} disabled={!complete}
                  title={complete ? undefined : 'Fill in every step first'}
                  className={cn(BTN, "bg-primary text-primary-foreground border-primary hover:opacity-90")}>
                  Add game
                </button>
              </div>
            ) : (
              <span className="text-[11px] text-muted-foreground">Step {stepIndex + 1} of 5</span>
            )
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Steps ─────────────────────────────────────────────────────────────────────

function TeamStep({ position, teams, draft, filter, setFilter, onPick }: {
  position: 'home' | 'away';
  teams: Team[];
  draft: GameDraft;
  filter: string;
  setFilter: (v: string) => void;
  onPick: (patch: Partial<GameDraft>) => void;
}) {
  // The team already taken by the other side can't play itself.
  const excludeId = position === 'home' ? draft.awayId : draft.homeId;
  const selectedId = position === 'home' ? draft.homeId : draft.awayId;
  const list = teams
    .filter(t => t.id !== excludeId)
    .filter(t => !filter || t.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <>
      {teams.length > 10 && (
        <input
          autoFocus
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter teams…"
          aria-label="Filter teams"
          className="mb-3 w-full max-w-sm rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:border-primary"
        />
      )}
      {list.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {teams.length === 0 ? 'No teams enrolled in this season.' : 'No teams match that filter.'}
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {list.map(t => (
            <button
              key={t.id}
              type="button"
              aria-pressed={selectedId === t.id}
              onClick={() => onPick(position === 'home' ? { homeId: t.id } : { awayId: t.id })}
              className={cn(TILE, selectedId === t.id && TILE_ON)}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function DateStep({ value, cal, setCal, onPick }: {
  value: string;
  cal: { y: number; m: number };
  setCal: (updater: (c: { y: number; m: number }) => { y: number; m: number }) => void;
  onPick: (iso: string) => void;
}) {
  const weeks = useMemo(() => buildMonthGrid(cal.y, cal.m), [cal]);
  const todayIso = new Date().toISOString().slice(0, 10);
  const monthLabel = new Date(Date.UTC(cal.y, cal.m, 1))
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  return (
    <div className="max-w-md">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => setCal(c => shiftMonth(c, -1))}
          aria-label="Previous month"
          className="rounded p-1.5 text-muted-foreground hover:text-primary hover:bg-muted/50">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold">{monthLabel}</span>
        <button type="button" onClick={() => setCal(c => shiftMonth(c, 1))}
          aria-label="Next month"
          className="rounded p-1.5 text-muted-foreground hover:text-primary hover:bg-muted/50">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <span key={i} className="flex h-6 items-center justify-center text-[10px] font-semibold text-muted-foreground/70">
            {d}
          </span>
        ))}
        {weeks.flat().map((iso, i) => iso === null
          ? <span key={`blank-${i}`} className="min-h-[52px]" />
          : (
            <button
              key={iso}
              type="button"
              aria-pressed={value === iso}
              aria-label={longDateLabel(iso)}
              onClick={() => onPick(iso)}
              className={cn(
                TILE, "tabular-nums px-0",
                iso === todayIso && "font-bold",
                value === iso && TILE_ON
              )}
            >
              {parseInt(iso.slice(8, 10), 10)}
            </button>
          ))}
      </div>
    </div>
  );
}

function TimeStep({ value, onPick }: { value: string; onPick: (t: string) => void }) {
  // Scroll target: the chosen time's hour, or 10 AM as a sane mid-morning default.
  const anchorHour = value ? parseInt(value.slice(0, 2), 10) : 10;
  return (
    <div className="max-w-lg space-y-3">
      {HOUR_GROUPS.map(g => (
        <div key={g.hour} data-scroll-anchor={g.hour === anchorHour ? 'true' : undefined}>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {g.label}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {g.times.map(t => (
              <button
                key={t}
                type="button"
                aria-pressed={value === t}
                onClick={() => onPick(t)}
                className={cn(TILE, "tabular-nums", value === t && TILE_ON)}
              >
                {fmt12h(t)}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function VenueStep({ draft, venues, seasonId, onPick, onFreeText, editing, onCommitFreeText }: {
  draft: GameDraft;
  venues: VenueDTO[] | null;
  seasonId: number;
  onPick: (patch: Partial<GameDraft>) => void;
  onFreeText: (patch: Partial<GameDraft>) => void;
  editing: boolean;
  onCommitFreeText: () => void;
}) {
  if (venues == null) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Loading venues…</p>;
  }

  // No season venues configured — fall back to the free-text location picker.
  // This is the one step whose value doesn't land on a single click, so in edit
  // mode it gets an explicit Done button.
  if (venues.length === 0) {
    return (
      <div className="max-w-md space-y-3">
        <LocationPicker
          locationId={draft.locationId}
          location={draft.fieldLocation}
          field={draft.fieldName}
          onChange={(val: LocationPickerValue) => onFreeText({
            fieldLocation: val.location, fieldName: val.field,
            locationId: val.locationId, seasonVenueId: null,
          })}
        />
        <p className="text-[11px] text-muted-foreground">
          No venues set up for this season —{' '}
          <Link className="text-primary underline" href={`/seasons/${seasonId}/venues`}>set up venues</Link>{' '}
          to pick them in one click instead.
        </p>
        {editing && (
          <button type="button" onClick={onCommitFreeText} disabled={!draft.fieldLocation.trim()}
            className={cn(BTN, "bg-primary text-primary-foreground border-primary hover:opacity-90")}>
            Done
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {venues.map(v => {
        const pick = (fieldName: string) => onPick({
          seasonVenueId: v.id, locationId: v.locationId, fieldLocation: v.name, fieldName,
        });
        const isSelected = (fieldName: string) =>
          draft.seasonVenueId === v.id && draft.fieldName === fieldName;
        return (
          <section key={v.id}>
            <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {v.name}
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {v.fields.filter(f => f.name !== TBD_FIELD).map(f => (
                <button key={f.id} type="button" aria-pressed={isSelected(f.name)}
                  onClick={() => pick(f.name)}
                  className={cn(TILE, isSelected(f.name) && TILE_ON)}>
                  {f.name}
                </button>
              ))}
              {/* Every venue gets a TBD tile so the venue can be booked before the
                  field is known — dashed so it reads as a placeholder. */}
              <button type="button" aria-pressed={isSelected(TBD_FIELD)}
                onClick={() => pick(TBD_FIELD)}
                title={`${v.name} — field to be determined`}
                className={cn(TILE, "border-dashed text-muted-foreground", isSelected(TBD_FIELD) && TILE_ON)}>
                TBD
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
