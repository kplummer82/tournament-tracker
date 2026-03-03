// lib/datetime.ts
const LOCALE = "en-US";
const TZ: string | undefined = undefined;

function parseYMD(dateStr?: string): Date | null {
  if (!dateStr) return null;
  const ymd = dateStr.slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const dt = new Date(dateStr);
  return isNaN(dt.getTime()) ? null : dt;
}
function parseYMD_HMS(dateStr?: string, timeStr?: string): Date | null {
  const base = parseYMD(dateStr);
  if (!base) return null;
  let hh = 0, mm = 0, ss = 0;
  if (timeStr) {
    const p = timeStr.split(":").map(Number);
    if (p.length >= 2) { hh = p[0] || 0; mm = p[1] || 0; if (p.length >= 3) ss = p[2] || 0; }
  }
  base.setHours(hh, mm, ss, 0);
  return base;
}
export function formatMMDDYY(dateStr?: string) {
  const d = parseYMD(dateStr);
  return d ? d.toLocaleDateString(LOCALE, { year: "2-digit", month: "2-digit", day: "2-digit", timeZone: TZ }) : "";
}
export function formatHHMMAMPM(dateStr?: string, timeStr?: string) {
  const d = parseYMD_HMS(dateStr, timeStr) ?? parseYMD(dateStr);
  return d
    ? d.toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: TZ }).replace(/\s/g, "").toUpperCase()
    : "";
}
