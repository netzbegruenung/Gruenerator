import { calendarDays, timeInBrief, type WeekdayId, weekdayId, weekdaysIn } from './briefFacts.js';

export type DatumRepair = {
  slide: number;
  feld: 'datum.date' | 'datum.time' | 'datum.weekday' | 'datum';
  wert: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The model's `datum` may only carry what the order says. An invented time,
 * day or weekday is dropped (and reported) instead of rejecting the draft;
 * a circle left with neither weekday nor date goes entirely. Works on the raw
 * model JSON, before the schema.
 */
export function repairDatum(
  input: unknown,
  given: string,
  /** Weekdays the draft being revised already carries — they stay, as the text no longer says them. */
  keptWeekdays: ReadonlySet<WeekdayId> = new Set()
): { input: unknown; repairs: DatumRepair[] } {
  if (!isRecord(input) || !Array.isArray(input.slides)) return { input, repairs: [] };
  const repairs: DatumRepair[] = [];
  const orderedDays = calendarDays(given);
  const orderedWeekdays = weekdaysIn(given);
  const squash = (v: string) => v.toLowerCase().replace(/\s+/g, '').replace(/\.$/, '');

  const slides = input.slides.map((slide: unknown, index) => {
    if (!isRecord(slide) || !('datum' in slide) || slide.datum == null) return slide;
    const drop = (feld: DatumRepair['feld'], wert: unknown) =>
      repairs.push({ slide: index, feld, wert: typeof wert === 'string' ? wert : '' });
    const { datum: raw, ...rest } = slide;
    if (!isRecord(raw)) {
      drop('datum', '');
      return rest;
    }
    const datum = { ...raw };
    const text = (key: string) => (typeof datum[key] === 'string' ? (datum[key] as string) : null);
    const time = text('time');
    const date = text('date');
    const weekday = text('weekday');

    if (datum.time !== undefined && (time === null || !time.trim() || !timeInBrief(time, given))) {
      drop('datum.time', time);
      delete datum.time;
    }
    if (datum.date !== undefined) {
      if (date === null || !date.trim()) {
        drop('datum.date', date);
        delete datum.date;
      } else {
        const clock = /^(\d{1,2})[.:]\d{2}$/.exec(squash(date));
        const hour = time === null ? null : /\d{1,2}/.exec(time)?.[0];
        const named = calendarDays(date);
        const inBrief = named.size
          ? [...named].every((day) => orderedDays.has(day))
          : squash(given).includes(squash(date));
        // „10.00“ next to „10 Uhr“ is the time again, never a day — even if the brief has it.
        if ((!named.size && clock && clock[1] === hour) || !inBrief) {
          drop('datum.date', date);
          delete datum.date;
        }
      }
    }
    if (datum.weekday !== undefined) {
      const id = weekday === null ? null : weekdayId(weekday);
      if (id === null || (!orderedWeekdays.has(id) && !keptWeekdays.has(id))) {
        drop('datum.weekday', weekday);
        delete datum.weekday;
      }
    }
    if (datum.weekday === undefined && datum.date === undefined) {
      drop('datum', '');
      return rest;
    }
    return { ...rest, datum };
  });
  return { input: { ...input, slides }, repairs };
}
