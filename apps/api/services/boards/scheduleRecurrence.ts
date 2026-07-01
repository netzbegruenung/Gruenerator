/**
 * Recurrence math for scheduled KI-Spalte runs.
 *
 * The UI speaks a small STRUCTURED recurrence (daily / weekly / monthly at a
 * wall-clock time — see scheduleRecurrenceSchema); the DB stores the canonical
 * iCalendar RRULE string. This module is the single seam between the two and owns
 * "when does this next fire, as a UTC instant, interpreting the wall-clock time in
 * the schedule's IANA timezone".
 *
 * We intentionally implement the constrained subset ourselves instead of pulling
 * in `rrule` + a timezone lib: the rule set is tiny and closed, and the timezone
 * correctness we need (fire at 09:00 local across DST) is a few lines of `Intl`.
 * The stored strings are still valid RRULEs so nothing is locked to this impl.
 */
import { type ScheduleRecurrence } from '@gruenerator/contracts';

// rrule/iCal weekday tokens, indexed 0 = Monday … 6 = Sunday (matches our schema).
const WEEKDAY_TOKENS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;

const FREQ_BY_KEYWORD = {
  daily: 'DAILY',
  weekly: 'WEEKLY',
  monthly: 'MONTHLY',
} as const;

/**
 * Build a canonical RRULE string from a structured recurrence. Callers should have
 * already filled `byweekday` (weekly) / `bymonthday` (monthly) with the creation-day
 * default via {@link withRecurrenceDefaults} so the stored rule is explicit.
 */
export function recurrenceToRRuleString(rec: ScheduleRecurrence): string {
  const parts = [`FREQ=${FREQ_BY_KEYWORD[rec.frequency]}`];
  if (rec.frequency === 'weekly' && rec.byweekday?.length) {
    parts.push(`BYDAY=${rec.byweekday.map((d) => WEEKDAY_TOKENS[d]).join(',')}`);
  }
  if (rec.frequency === 'monthly' && rec.bymonthday != null) {
    parts.push(`BYMONTHDAY=${rec.bymonthday}`);
  }
  parts.push(`BYHOUR=${rec.hour}`, `BYMINUTE=${rec.minute}`, 'BYSECOND=0');
  return parts.join(';');
}

/** Parse a canonical RRULE string produced by {@link recurrenceToRRuleString}. */
export function rruleStringToRecurrence(rrule: string): ScheduleRecurrence {
  const map = new Map<string, string>();
  for (const token of rrule.split(';')) {
    const [k, v] = token.split('=');
    if (k && v) map.set(k.toUpperCase(), v);
  }
  const freqRaw = map.get('FREQ');
  const frequency = (Object.keys(FREQ_BY_KEYWORD) as ScheduleRecurrence['frequency'][]).find(
    (key) => FREQ_BY_KEYWORD[key] === freqRaw
  );
  const hour = Number(map.get('BYHOUR') ?? '9');
  const minute = Number(map.get('BYMINUTE') ?? '0');

  const recurrence: ScheduleRecurrence = {
    frequency: frequency ?? 'daily',
    hour: Number.isFinite(hour) ? hour : 9,
    minute: Number.isFinite(minute) ? minute : 0,
  };

  const byday = map.get('BYDAY');
  if (byday) {
    const days = byday
      .split(',')
      .map((tok) => WEEKDAY_TOKENS.indexOf(tok.trim() as (typeof WEEKDAY_TOKENS)[number]))
      .filter((i) => i >= 0);
    if (days.length) recurrence.byweekday = days;
  }
  const bymonthday = map.get('BYMONTHDAY');
  if (bymonthday) recurrence.bymonthday = Number(bymonthday);

  return recurrence;
}

/**
 * Fill the weekly/monthly selector with a sensible default derived from `at` (the
 * creation moment, interpreted in `timezone`) so the stored rule is fully explicit.
 */
export function withRecurrenceDefaults(
  rec: ScheduleRecurrence,
  timezone: string,
  at: Date
): ScheduleRecurrence {
  if (rec.frequency === 'weekly' && !rec.byweekday?.length) {
    const { weekday } = zonedParts(at, timezone);
    return { ...rec, byweekday: [weekday] };
  }
  if (rec.frequency === 'monthly' && rec.bymonthday == null) {
    const { day } = zonedParts(at, timezone);
    return { ...rec, bymonthday: day };
  }
  return rec;
}

/**
 * The next UTC instant strictly after `after` at which this recurrence fires, with
 * the wall-clock hour/minute interpreted in `timezone`. Scans forward day-by-day
 * (cheap; bounded to ~14 months to cover the sparsest monthly rule) and returns the
 * first matching day's instant that lands past `after`.
 */
export function computeNextRun(rec: ScheduleRecurrence, timezone: string, after: Date): Date {
  const start = zonedParts(after, timezone);
  // Iterate calendar days in the target timezone starting from `after`'s local day.
  for (let offset = 0; offset < 420; offset++) {
    const { year, month, day } = addDays(start.year, start.month, start.day, offset);
    if (!dayMatches(rec, year, month, day)) continue;
    const instant = zonedWallClockToUtc(year, month, day, rec.hour, rec.minute, timezone);
    if (instant.getTime() > after.getTime()) return instant;
  }
  // Unreachable for valid rules; fall back to +1 day so a schedule never wedges.
  return new Date(after.getTime() + 24 * 60 * 60 * 1000);
}

// ── date helpers (dependency-free) ─────────────────────────────────────────────

function dayMatches(rec: ScheduleRecurrence, year: number, month: number, day: number): boolean {
  if (rec.frequency === 'daily') return true;
  if (rec.frequency === 'weekly') {
    const weekday = mondayIndex(year, month, day);
    return (rec.byweekday ?? []).includes(weekday);
  }
  // monthly: match the target day-of-month; a rule for the 31st simply skips
  // months that are too short (no clamping — matches RRULE semantics).
  return rec.bymonthday != null && rec.bymonthday === day;
}

/** Calendar-add `days` to a Y/M/D triple (month is 1-based). */
function addDays(
  year: number,
  month: number,
  day: number,
  days: number
): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** Weekday of a Y/M/D date as 0 = Monday … 6 = Sunday. */
function mondayIndex(year: number, month: number, day: number): number {
  const sundayZero = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = Sun
  return (sundayZero + 6) % 7;
}

/** The wall-clock Y/M/D (+ Monday-indexed weekday) of `date` in `timezone`. */
function zonedParts(
  date: Date,
  timezone: string
): { year: number; month: number; day: number; weekday: number } {
  const map = intlParts(date, timezone);
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    weekday: mondayIndex(map.year, map.month, map.day),
  };
}

/**
 * Convert a wall-clock time in `timezone` to the corresponding UTC instant. Guess
 * the instant as if the wall clock were UTC, then correct by that zone's offset at
 * the guess (one correction is exact except in the rare DST-gap hour, which a
 * scheduler tolerates).
 */
function zonedWallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string
): Date {
  const asUtcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offsetMs = zoneOffsetMs(new Date(asUtcGuess), timezone);
  return new Date(asUtcGuess - offsetMs);
}

/** Offset (local − UTC) in ms for `timezone` at `date`. */
function zoneOffsetMs(date: Date, timezone: string): number {
  const p = intlParts(date, timezone);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asIfUtc - date.getTime();
}

function intlParts(
  date: Date,
  timezone: string
): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) parts[part.type] = part.value;
  // Intl can emit hour "24" at midnight in some engines; normalise to 0.
  const hour = Number(parts.hour) % 24;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}
