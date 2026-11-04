import type { Settings } from './schema';

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseTime(value: string): number | null {
  const m = TIME_RE.exec(value);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/** True when `now` is inside [from, to). Handles windows that cross midnight. */
export function inWindow(now: Date, from: string, to: string): boolean {
  const start = parseTime(from);
  const end = parseTime(to);
  if (start === null || end === null || start === end) return true;
  const t = minutesOfDay(now);
  return start < end ? t >= start && t < end : t >= start || t < end;
}

/** The next time (after `now`) at which the schedule window opens or closes. */
export function nextBoundary(now: Date, from: string, to: string): Date | null {
  const points = [parseTime(from), parseTime(to)].filter((p): p is number => p !== null);
  if (points.length < 2 || points[0] === points[1]) return null;
  const t = minutesOfDay(now);
  const ahead = points.map((p) => (p > t ? p - t : p - t + 24 * 60));
  const minutes = Math.min(...ahead);
  const next = new Date(now);
  next.setSeconds(0, 0);
  next.setMinutes(next.getMinutes() + minutes);
  return next;
}

export function automationActive(settings: Settings, now: Date, osPrefersDark: boolean): boolean {
  const { kind, schedule } = settings.automation;
  switch (kind) {
    case 'off':
      return true;
    case 'schedule':
      return inWindow(now, schedule.from, schedule.to);
    case 'system':
      return osPrefersDark;
  }
}
