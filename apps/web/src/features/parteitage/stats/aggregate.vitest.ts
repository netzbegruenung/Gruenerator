import { type ConventionSpeechPublic } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import {
  applyFilters,
  countBy,
  listBlocks,
  resultPoints,
  schlussCounts,
  type ParteitagFilters,
} from './aggregate';

let n = 0;
function speech(over: Partial<ConventionSpeechPublic> = {}): ConventionSpeechPublic {
  n += 1;
  return {
    key: `k${n}`,
    id: `id${n}`,
    slug: `s${n}`,
    day: '2026-01-10',
    dayLabel: 'Samstag',
    listPlace: n,
    seatType: 'offen',
    firstName: 'A',
    lastName: `L${n}`,
    kv: 'KV',
    area: 'kreis',
    contested: false,
    elected: true,
    resultPercent: 80,
    deliveredBy: null,
    topic: 'Klima',
    durationS: 60,
    wordCount: 100,
    analysis: {
      anrede: 'Liebe Freunde',
      schluss: ['Danke'],
      nennungen: {},
      signatur: '',
      wpm: null,
      woerter: 100,
      vorgetragen: false,
    },
    reelUrl: '',
    posterUrl: '',
    ...over,
  };
}

const none: ParteitagFilters = {
  area: null,
  seatType: null,
  topic: null,
  day: null,
  outcome: null,
};

describe('applyFilters', () => {
  const a = speech({ area: 'kreis', seatType: 'frauenplatz', topic: 'Klima', day: '2026-01-10' });
  const b = speech({
    area: 'ohne',
    topic: 'Wohnen',
    day: '2026-01-11',
    elected: false,
    contested: true,
  });
  const c = speech({ area: 'kreis', topic: 'Klima', day: '2026-01-11', elected: null });
  const all = [a, b, c];

  it('returns all without filters', () => {
    expect(applyFilters(all, none)).toHaveLength(3);
  });
  it('combines filters with AND', () => {
    expect(applyFilters(all, { ...none, area: 'kreis', day: '2026-01-11' })).toEqual([c]);
    expect(applyFilters(all, { ...none, seatType: 'frauenplatz', topic: 'Klima' })).toEqual([a]);
  });
  it('maps outcome', () => {
    expect(applyFilters(all, { ...none, outcome: 'gewaehlt' })).toEqual([a]);
    expect(applyFilters(all, { ...none, outcome: 'unterlegen' })).toEqual([b]);
  });
});

describe('listBlocks', () => {
  it('sums to elected count', () => {
    const sp = [
      speech({ listPlace: 1, area: 'kreis' }),
      speech({ listPlace: 10, area: 'ohne' }),
      speech({ listPlace: 11, area: 'kreisfreie_stadt' }),
      speech({ listPlace: 25, area: 'kreis', elected: false, contested: true }),
      speech({ listPlace: 26, area: 'kreis', elected: null }),
    ];
    const blocks = listBlocks(sp);
    const sum = blocks.reduce((s, x) => s + x.kreisfreieStadt + x.kreis + x.ohne, 0);
    expect(sum).toBe(3);
    expect(blocks).toEqual([
      { block: '1–10', kreisfreieStadt: 0, kreis: 1, ohne: 1 },
      { block: '11–20', kreisfreieStadt: 1, kreis: 0, ohne: 0 },
    ]);
  });
});

describe('resultPoints', () => {
  it('excludes contested and null results', () => {
    const sp = [
      speech({ listPlace: 1, resultPercent: 90 }),
      speech({ listPlace: 2, contested: true, resultPercent: 55 }),
      speech({ listPlace: 3, resultPercent: null }),
    ];
    const pts = resultPoints(sp);
    expect(pts).toHaveLength(1);
    expect(pts[0]).toMatchObject({ listPlace: 1, resultPercent: 90, area: 'kreis' });
  });
});

describe('counts', () => {
  it('countBy topic sorts by count desc', () => {
    const sp = [speech({ topic: 'A' }), speech({ topic: 'B' }), speech({ topic: 'B' })];
    expect(countBy(sp, 'topic')).toEqual([
      ['B', 2],
      ['A', 1],
    ]);
  });
  it('countBy anrede skips null', () => {
    const sp = [speech(), speech({ analysis: { ...speech().analysis, anrede: null } })];
    expect(countBy(sp, 'anrede')).toEqual([['Liebe Freunde', 1]]);
  });
  it('schlussCounts flattens', () => {
    const base = speech().analysis;
    const sp = [
      speech({ analysis: { ...base, schluss: ['Danke', 'Tschüss'] } }),
      speech({ analysis: { ...base, schluss: ['Danke'] } }),
    ];
    expect(schlussCounts(sp)).toEqual([
      ['Danke', 2],
      ['Tschüss', 1],
    ]);
  });
});
