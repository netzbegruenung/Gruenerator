import {
  type ConventionArea,
  type ConventionSpeechPublic,
  type SeatType,
} from '@gruenerator/contracts';

import { kvToAgs } from './kvToKreis';

export type ParteitagFilters = {
  area: ConventionArea | null;
  seatType: SeatType | null;
  topic: string | null;
  day: string | null;
  outcome: 'gewaehlt' | 'unterlegen' | null;
  /** AGS des Kreises bzw. der kreisfreien Stadt (NRW). */
  kreis: string | null;
};

export function applyFilters(
  speeches: ConventionSpeechPublic[],
  f: ParteitagFilters
): ConventionSpeechPublic[] {
  return speeches.filter((s) => {
    if (f.area && s.area !== f.area) return false;
    if (f.seatType && s.seatType !== f.seatType) return false;
    if (f.topic && s.topic !== f.topic) return false;
    if (f.day && s.day !== f.day) return false;
    if (f.kreis && kvToAgs(s.kv) !== f.kreis) return false;
    if (f.outcome === 'gewaehlt' && s.elected !== true) return false;
    if (f.outcome === 'unterlegen' && !(s.contested && s.elected === false)) return false;
    return true;
  });
}

export function listBlocks(
  speeches: ConventionSpeechPublic[]
): { block: string; kreisfreieStadt: number; kreis: number; ohne: number }[] {
  const byStart = new Map<
    number,
    { block: string; kreisfreieStadt: number; kreis: number; ohne: number }
  >();
  for (const s of speeches) {
    if (s.elected !== true) continue;
    const start = Math.floor((s.listPlace - 1) / 10) * 10 + 1;
    let row = byStart.get(start);
    if (!row) {
      row = { block: `${start}–${start + 9}`, kreisfreieStadt: 0, kreis: 0, ohne: 0 };
      byStart.set(start, row);
    }
    if (s.area === 'kreisfreie_stadt') row.kreisfreieStadt += 1;
    else if (s.area === 'kreis') row.kreis += 1;
    else row.ohne += 1;
  }
  return [...byStart.entries()].sort((a, b) => a[0] - b[0]).map(([, row]) => row);
}

export function resultPoints(
  speeches: ConventionSpeechPublic[]
): { listPlace: number; resultPercent: number; area: ConventionArea; name: string }[] {
  const out: { listPlace: number; resultPercent: number; area: ConventionArea; name: string }[] =
    [];
  for (const s of speeches) {
    if (s.contested || s.resultPercent === null) continue;
    out.push({
      listPlace: s.listPlace,
      resultPercent: s.resultPercent,
      area: s.area,
      name: `${s.firstName} ${s.lastName}`.trim(),
    });
  }
  return out;
}

function tally(values: string[]): [string, number][] {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export function countBy(
  speeches: ConventionSpeechPublic[],
  key: 'topic' | 'anrede'
): [string, number][] {
  const values: string[] = [];
  for (const s of speeches) {
    const v = key === 'topic' ? s.topic : s.analysis.anrede;
    if (v) values.push(v);
  }
  return tally(values);
}

export function schlussCounts(speeches: ConventionSpeechPublic[]): [string, number][] {
  return tally(speeches.flatMap((s) => s.analysis.schluss));
}
