import { useState } from "react";
import { X, Plus, CalendarDays, ChevronLeft, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ScheduleConfig, DayRule, FieldConfig, ScheduleResult } from "@/lib/auto-schedule";

const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const BLANK_CONFIG: ScheduleConfig = {
  firstGameDate: '',
  lastGameDate: '',
  blackoutDates: [],
  dayRules: [],
  fields: [],
  maxRepeatMatchups: 1,
};

function emptyDayRule(dow: DayRule['dayOfWeek']): DayRule {
  return { dayOfWeek: dow, maxGamesPerDay: 2, gameTimes: ['10:00'], maxGamesPerTeamOnDay: 1 };
}

type PreviewData = ScheduleResult & { existingGameCount: number };

interface Props {
  seasonId: number;
  initialConfig: ScheduleConfig | null;
  onClose: () => void;
  onCreated: () => void;
}

const BTN = "inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] border transition-colors";

export default function AutoScheduleModal({ seasonId, initialConfig, onClose, onCreated }: Props) {
  const [step, setStep] = useState<'config' | 'preview'>('config');
  const [config, setConfig] = useState<ScheduleConfig>(initialConfig ?? BLANK_CONFIG);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [mode, setMode] = useState<'add' | 'replace'>('add');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newBlackout, setNewBlackout] = useState('');
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldLocation, setNewFieldLocation] = useState('');

  // ── Config helpers ────────────────────────────────────────────────────────

  function isDayEnabled(dow: number) {
    return config.dayRules.some(r => r.dayOfWeek === dow);
  }

  function getDayRule(dow: number): DayRule | undefined {
    return config.dayRules.find(r => r.dayOfWeek === dow);
  }

  function toggleDay(dow: DayRule['dayOfWeek']) {
    if (isDayEnabled(dow)) {
      setConfig(c => ({ ...c, dayRules: c.dayRules.filter(r => r.dayOfWeek !== dow) }));
    } else {
      setConfig(c => ({
        ...c,
        dayRules: [...c.dayRules, emptyDayRule(dow)].sort((a, b) => a.dayOfWeek - b.dayOfWeek),
      }));
    }
  }

  function updateDayRule(dow: number, patch: Partial<DayRule>) {
    setConfig(c => ({
      ...c,
      dayRules: c.dayRules.map(r => r.dayOfWeek === dow ? { ...r, ...patch } : r),
    }));
  }

  function addTimeToDay(dow: number) {
    updateDayRule(dow, { gameTimes: [...(getDayRule(dow)?.gameTimes ?? []), '12:00'] });
  }

  function updateTimeOnDay(dow: number, idx: number, value: string) {
    const rule = getDayRule(dow);
    if (!rule) return;
    const times = [...rule.gameTimes];
    times[idx] = value;
    updateDayRule(dow, { gameTimes: times });
  }

  function removeTimeFromDay(dow: number, idx: number) {
    const rule = getDayRule(dow);
    if (!rule) return;
    updateDayRule(dow, { gameTimes: rule.gameTimes.filter((_, i) => i !== idx) });
  }

  function addBlackout() {
    if (!newBlackout || config.blackoutDates.includes(newBlackout)) return;
    setConfig(c => ({ ...c, blackoutDates: [...c.blackoutDates, newBlackout].sort() }));
    setNewBlackout('');
  }

  function addField() {
    if (!newFieldName.trim()) return;
    setConfig(c => ({
      ...c,
      fields: [...c.fields, { name: newFieldName.trim(), location: newFieldLocation.trim() }],
    }));
    setNewFieldName('');
    setNewFieldLocation('');
  }

  // ── API calls ────────────────────────────────────────────────────────────

  async function saveConfigToSeason() {
    await fetch(`/api/seasons/${seasonId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schedule_config: config }),
    });
  }

  async function handleGeneratePreview() {
    if (!config.firstGameDate || !config.lastGameDate) {
      setError('First and last game dates are required.');
      return;
    }
    if (config.dayRules.length === 0) {
      setError('Enable at least one day of the week.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await saveConfigToSeason();
      const res = await fetch(`/api/seasons/${seasonId}/auto-schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config, dry_run: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Preview failed');
      setPreview(json as PreviewData);
      setMode('add');
      setStep('preview');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    if (!preview) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/seasons/${seasonId}/auto-schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config, dry_run: false, mode }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Create failed');
      onCreated();
    } catch (e: any) {
      setError(e.message);
      setLoading(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 overflow-y-auto py-8 px-4">
      <div
        className="relative bg-background border border-border w-full max-w-2xl"
        style={{ fontFamily: 'var(--font-body)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            {step === 'preview' && (
              <button
                type="button"
                onClick={() => setStep('config')}
                className="text-muted-foreground hover:text-foreground transition-colors mr-1"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            <CalendarDays className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold uppercase tracking-wide">
              {step === 'config' ? 'Auto-Schedule Setup' : 'Schedule Preview'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-6 max-h-[75vh] overflow-y-auto">
          {error && (
            <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/30 text-destructive text-xs">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          {/* ── CONFIG STEP ─────────────────────────────────────────────── */}
          {step === 'config' && (
            <>
              {/* Date Range */}
              <section>
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-3">
                  Date Range
                </h3>
                <div className="flex items-center gap-3 flex-wrap">
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide">First Game Date</span>
                    <input
                      type="date"
                      value={config.firstGameDate}
                      onChange={e => setConfig(c => ({ ...c, firstGameDate: e.target.value }))}
                      className="border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:border-primary"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Last Game Date</span>
                    <input
                      type="date"
                      value={config.lastGameDate}
                      onChange={e => setConfig(c => ({ ...c, lastGameDate: e.target.value }))}
                      className="border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:border-primary"
                    />
                  </label>
                </div>
              </section>

              {/* Blackout Dates */}
              <section>
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-3">
                  Blackout Dates
                </h3>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  {config.blackoutDates.map(d => (
                    <span key={d} className="inline-flex items-center gap-1 px-2 py-0.5 bg-muted border border-border text-[11px]">
                      {d}
                      <button
                        type="button"
                        onClick={() => setConfig(c => ({ ...c, blackoutDates: c.blackoutDates.filter(x => x !== d) }))}
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
                    onChange={e => setNewBlackout(e.target.value)}
                    className="border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={addBlackout}
                    className={cn(BTN, "border-border text-muted-foreground hover:border-primary hover:text-primary")}
                  >
                    <Plus className="h-3 w-3" /> Add
                  </button>
                </div>
              </section>

              {/* Day Rules */}
              <section>
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-3">
                  Day Rules
                </h3>
                <div className="space-y-2">
                  {([0, 1, 2, 3, 4, 5, 6] as DayRule['dayOfWeek'][]).map(dow => {
                    const enabled = isDayEnabled(dow);
                    const rule = getDayRule(dow);
                    return (
                      <div
                        key={dow}
                        className={cn(
                          "border border-border p-3 transition-colors",
                          enabled ? "border-primary/40" : "opacity-60"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={`day-${dow}`}
                            checked={enabled}
                            onChange={() => toggleDay(dow)}
                            className="accent-primary"
                          />
                          <label htmlFor={`day-${dow}`} className="text-xs font-semibold cursor-pointer">
                            {DAY_FULL[dow]}
                          </label>
                        </div>
                        {enabled && rule && (
                          <div className="space-y-3 mt-3 ml-5">
                            <div className="flex items-start gap-4 flex-wrap">
                              <label className="flex flex-col gap-1">
                                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                                  Max games/day
                                </span>
                                <input
                                  type="number"
                                  min={1}
                                  value={rule.maxGamesPerDay}
                                  onChange={e => updateDayRule(dow, { maxGamesPerDay: Number(e.target.value) })}
                                  className="w-16 border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:border-primary"
                                />
                              </label>
                              <label className="flex flex-col gap-1">
                                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                                  Max games/team/day
                                </span>
                                <input
                                  type="number"
                                  min={1}
                                  value={rule.maxGamesPerTeamOnDay}
                                  onChange={e => updateDayRule(dow, { maxGamesPerTeamOnDay: Number(e.target.value) })}
                                  className="w-16 border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:border-primary"
                                />
                              </label>
                              <label className="flex flex-col gap-1">
                                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                                  Target games/team for season{' '}
                                  <span className="normal-case font-normal">(optional)</span>
                                </span>
                                <input
                                  type="number"
                                  min={1}
                                  placeholder="—"
                                  value={rule.targetGamesPerTeamForSeason ?? ''}
                                  onChange={e =>
                                    updateDayRule(dow, {
                                      targetGamesPerTeamForSeason:
                                        e.target.value === '' ? undefined : Number(e.target.value),
                                    })
                                  }
                                  className="w-16 border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:border-primary"
                                />
                              </label>
                            </div>
                            <div>
                              <span className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1.5">
                                Game Times
                              </span>
                              <div className="flex items-center gap-2 flex-wrap">
                                {rule.gameTimes.map((t, i) => (
                                  <span
                                    key={i}
                                    className="inline-flex items-center gap-1 border border-border bg-muted px-2 py-0.5 text-xs"
                                  >
                                    <input
                                      type="time"
                                      value={t}
                                      onChange={e => updateTimeOnDay(dow, i, e.target.value)}
                                      className="bg-transparent text-xs focus:outline-none w-[70px]"
                                    />
                                    <button type="button" onClick={() => removeTimeFromDay(dow, i)}>
                                      <X className="h-3 w-3" />
                                    </button>
                                  </span>
                                ))}
                                <button
                                  type="button"
                                  onClick={() => addTimeToDay(dow)}
                                  className={cn(
                                    BTN,
                                    "border-border text-muted-foreground hover:border-primary hover:text-primary text-[10px] px-2 py-0.5"
                                  )}
                                >
                                  <Plus className="h-3 w-3" /> Time
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Fields */}
              <section>
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-1">
                  Fields <span className="normal-case font-normal">(optional)</span>
                </h3>
                <p className="text-[10px] text-muted-foreground mb-3">
                  Games are distributed across fields in round-robin order. Leave empty to skip field assignment.
                </p>
                <div className="space-y-1.5 mb-3">
                  {config.fields.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      {f.location && <span className="text-muted-foreground">{f.location} —</span>}
                      <span className="font-medium">{f.name}</span>
                      <button
                        type="button"
                        onClick={() => setConfig(c => ({ ...c, fields: c.fields.filter((_, j) => j !== i) }))}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    placeholder="Location (e.g. Main Park)"
                    value={newFieldLocation}
                    onChange={e => setNewFieldLocation(e.target.value)}
                    className="border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:border-primary w-40"
                  />
                  <input
                    placeholder="Field name (e.g. Field 1)"
                    value={newFieldName}
                    onChange={e => setNewFieldName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addField()}
                    className="border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:border-primary w-36"
                  />
                  <button
                    type="button"
                    onClick={addField}
                    className={cn(BTN, "border-border text-muted-foreground hover:border-primary hover:text-primary")}
                  >
                    <Plus className="h-3 w-3" /> Add Field
                  </button>
                </div>
              </section>

              {/* Matchup Rules */}
              <section>
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-3">
                  Matchup Rules
                </h3>
                <label className="flex items-center gap-3">
                  <span className="text-xs">Max times the same two teams play each other</span>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={config.maxRepeatMatchups}
                    onChange={e => setConfig(c => ({ ...c, maxRepeatMatchups: Number(e.target.value) }))}
                    className="w-16 border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:border-primary"
                  />
                </label>
              </section>
            </>
          )}

          {/* ── PREVIEW STEP ────────────────────────────────────────────── */}
          {step === 'preview' && preview && (
            <>
              {/* Stats summary */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Games Generated', value: preview.stats.totalGames },
                  { label: 'Teams', value: Object.keys(preview.stats.teamGameCounts).length },
                  { label: 'Unique Matchups', value: Object.keys(preview.stats.matchupCounts).length },
                ].map(s => (
                  <div key={s.label} className="border border-border p-3 text-center">
                    <div
                      className="text-2xl font-bold"
                      style={{ fontFamily: 'var(--font-display)' }}
                    >
                      {s.value}
                    </div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>

              {/* Existing games: add vs replace choice */}
              {preview.existingGameCount > 0 && (
                <div className="border border-amber-400/40 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-2">
                  <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                    This season already has {preview.existingGameCount} regular season game
                    {preview.existingGameCount !== 1 ? 's' : ''}.
                  </p>
                  <div className="space-y-1.5">
                    {(['add', 'replace'] as const).map(m => (
                      <label key={m} className="flex items-start gap-2 text-xs cursor-pointer">
                        <input
                          type="radio"
                          name="mode"
                          value={m}
                          checked={mode === m}
                          onChange={() => setMode(m)}
                          className="accent-primary mt-0.5 shrink-0"
                        />
                        <span>
                          {m === 'add'
                            ? `Add ${preview.stats.totalGames} new games alongside existing ${preview.existingGameCount} (${preview.stats.totalGames + preview.existingGameCount} total)`
                            : `Replace: delete ${preview.existingGameCount} existing game${preview.existingGameCount !== 1 ? 's' : ''} and create ${preview.stats.totalGames} new ones`}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Warnings */}
              {preview.warnings.length > 0 && (
                <div className="border border-amber-400/40 bg-amber-50 dark:bg-amber-950/20 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400 mb-1.5">
                    Warnings
                  </p>
                  <ul className="space-y-0.5">
                    {preview.warnings.map((w, i) => (
                      <li
                        key={i}
                        className="text-xs text-amber-800 dark:text-amber-300 flex items-start gap-1.5"
                      >
                        <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Team breakdown */}
              <section>
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-2">
                  Team Breakdown
                </h3>
                <div className="grid grid-cols-2 gap-1">
                  {Object.entries(preview.stats.teamGameCounts)
                    .sort((a, b) => Number(b[1]) - Number(a[1]))
                    .map(([teamId, count]) => {
                      const id = Number(teamId);
                      const g = preview.games.find(g => g.home === id || g.away === id);
                      const name = g
                        ? g.home === id ? g.home_team : g.away_team
                        : `Team ${teamId}`;
                      return (
                        <div
                          key={teamId}
                          className="flex items-center justify-between px-2 py-1 bg-muted/40 text-xs"
                        >
                          <span className="truncate">{name}</span>
                          <span className="font-semibold ml-2 shrink-0">{count}g</span>
                        </div>
                      );
                    })}
                </div>
              </section>

              {/* Sample games */}
              <section>
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-2">
                  Sample Games (first {Math.min(8, preview.games.length)} of {preview.games.length})
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px] border border-border">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        {['Date', 'Time', 'Home', 'Away', 'Field'].map(h => (
                          <th
                            key={h}
                            className="text-left px-2 py-1.5 font-semibold uppercase tracking-wide text-[10px] text-muted-foreground"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.games.slice(0, 8).map((g, i) => (
                        <tr key={i} className="border-b border-border/60">
                          <td className="px-2 py-1">{g.gamedate}</td>
                          <td className="px-2 py-1">{g.gametime}</td>
                          <td className="px-2 py-1 font-medium">{g.home_team}</td>
                          <td className="px-2 py-1 font-medium">{g.away_team}</td>
                          <td className="px-2 py-1 text-muted-foreground">
                            {[g.location, g.field].filter(Boolean).join(' — ') || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className={cn(BTN, "border-border text-muted-foreground hover:border-foreground hover:text-foreground")}
          >
            Cancel
          </button>
          {step === 'config' ? (
            <button
              type="button"
              onClick={handleGeneratePreview}
              disabled={loading}
              className={cn(BTN, "bg-primary text-primary-foreground border-primary hover:opacity-90 disabled:opacity-50")}
            >
              {loading ? 'Generating…' : 'Generate Preview →'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleConfirm}
              disabled={loading || !preview || preview.stats.totalGames === 0}
              className={cn(BTN, "bg-primary text-primary-foreground border-primary hover:opacity-90 disabled:opacity-50")}
            >
              {loading
                ? 'Creating…'
                : `Confirm: Create ${preview?.stats.totalGames ?? 0} Game${preview?.stats.totalGames !== 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
