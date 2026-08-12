// lib/scheduling/timeGrid.ts
//
// Pure date/time presentation helpers shared by the season scheduling page and the
// manual-game wizard. No DB, no React — safe to import from anywhere.

export const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "14:30" → "2:30 PM" */
export function fmt12h(time: string): string {
  const [hStr, mStr] = time.split(':');
  const h = parseInt(hStr, 10);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${mStr} ${suffix}`;
}

/** 6:00 AM → 10:00 PM in 15-minute steps ("HH:MM" 24h). */
export const TIME_OPTIONS: string[] = (() => {
  const out: string[] = [];
  for (let mins = 6 * 60; mins <= 22 * 60; mins += 15) {
    out.push(`${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`);
  }
  return out;
})();

/** TIME_OPTIONS grouped by hour, with a "6 AM" style label. */
export const HOUR_GROUPS: { hour: number; label: string; times: string[] }[] = (() => {
  const byHour = new Map<number, string[]>();
  for (const t of TIME_OPTIONS) {
    const h = parseInt(t.slice(0, 2), 10);
    (byHour.get(h) ?? byHour.set(h, []).get(h)!).push(t);
  }
  return [...byHour.entries()].map(([hour, times]) => ({
    hour,
    label: `${hour % 12 || 12} ${hour >= 12 ? 'PM' : 'AM'}`,
    times,
  }));
})();

/** Weeks (7 cells each) of ISO dates for month m (0-based) of year y; null = padding. */
export function buildMonthGrid(y: number, m: number): (string | null)[][] {
  const startDow = new Date(Date.UTC(y, m, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function shiftMonth(c: { y: number; m: number }, delta: number): { y: number; m: number } {
  const d = new Date(Date.UTC(c.y, c.m + delta, 1));
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
}
