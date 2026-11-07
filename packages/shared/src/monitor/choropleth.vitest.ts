import { type EuGreensData, type PollsOverviewResponse } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import {
  buildChoropleth,
  europaGrueneValues,
  laenderGrueneValues,
  partyOrder,
  scaleDomain,
} from './choropleth';

import type { FeatureCollection } from 'geojson';

const square = (name: string, x: number): FeatureCollection['features'][number] => ({
  type: 'Feature',
  properties: { name },
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [x, 50],
        [x + 1, 50],
        [x + 1, 51],
        [x, 51],
        [x, 50],
      ],
    ],
  },
});

describe('partyOrder', () => {
  it('sorts descending and drops zero shares', () => {
    expect(partyOrder({ SPD: 15, 'CDU/CSU': 30, GRÜNE: 12, Sonstige: 0 })).toEqual([
      'CDU/CSU',
      'SPD',
      'GRÜNE',
    ]);
  });
});

describe('laenderGrueneValues', () => {
  it('maps every Bundesland to its Grüne value, null when missing', () => {
    const data = {
      entries: [{ parliament: 'bayern', gruene: 14.5, latestPollDate: '2026-10-01' }],
    } as unknown as PollsOverviewResponse;
    const v = laenderGrueneValues(data);
    expect(Object.keys(v)).toHaveLength(16);
    expect(v['Bayern'].v).toBe(14.5);
    expect(v['Hessen'].v).toBeNull();
  });
});

describe('europaGrueneValues', () => {
  it('joins by geo name and skips unknown country codes', () => {
    const data = {
      results: [
        {
          countryCode: 'fr',
          countryName: 'Frankreich',
          party: 'NFP',
          percent: 24,
          broadAlliance: true,
        },
        {
          countryCode: 'xx',
          countryName: 'Nirgendwo',
          party: 'X',
          percent: 3,
          broadAlliance: false,
        },
      ],
    } as unknown as EuGreensData;
    const v = europaGrueneValues(data);
    expect(v['France']).toMatchObject({ v: 24, label: 'Frankreich', marked: true });
    expect(Object.keys(v)).toEqual(['France']);
  });
});

describe('scaleDomain', () => {
  it('falls back until two real values exist and ignores alliances', () => {
    expect(scaleDomain({ A: { v: 5 } }, [3, 18])).toEqual([3, 18]);
    expect(
      scaleDomain({ A: { v: 4.2 }, B: { v: 29.1 }, C: { v: 90, marked: true } }, [3, 18])
    ).toEqual([4, 30]);
  });
});

describe('buildChoropleth', () => {
  const geo: FeatureCollection = {
    type: 'FeatureCollection',
    features: [square('Alpha', 10), square('Beta', 12)],
  };

  it('returns a non-empty path and a centroid for a small polygon', () => {
    const { shapes } = buildChoropleth({
      geo,
      width: 380,
      height: 470,
      values: { Alpha: { v: 10 }, Beta: { v: null } },
      domain: [3, 18],
    });
    expect(shapes[0].d).toMatch(/^M/);
    expect(shapes[0].area).toBeGreaterThan(0);
    expect(Number.isFinite(shapes[0].cx)).toBe(true);
    expect(shapes[1].v).toBeNull();
  });

  it('keeps the same paths when only the values change', () => {
    const a = buildChoropleth({
      geo,
      width: 300,
      height: 300,
      values: { Alpha: { v: 5 } },
      domain: [3, 18],
    });
    const b = buildChoropleth({
      geo,
      width: 300,
      height: 300,
      values: { Alpha: { v: 9 } },
      domain: [3, 18],
    });
    expect(a.shapes.map((s) => s.d)).toEqual(b.shapes.map((s) => s.d));
  });
});
