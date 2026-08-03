import { describe, expect, it } from 'vitest';

import { buildBahnCardView, formatBahnDate, MAX_ROWS, toRow, trainLabel } from './bahnCardView';

import type { BahnEntry, BahnPayload } from '@gruenerator/contracts';

function entry(overrides: Partial<BahnEntry> = {}): BahnEntry {
  return {
    id: 'e1',
    category: 'ICE',
    number: '204',
    line: null,
    departureTime: '09:14',
    departurePlatform: '7',
    arrivalTime: null,
    arrivalPlatform: null,
    destination: 'Hamburg Hbf',
    via: [],
    ...overrides,
  };
}

function payload(overrides: Partial<BahnPayload> = {}): BahnPayload {
  return {
    kind: 'timetable',
    station: 'Berlin Hbf',
    date: '2026-07-17',
    hour: '09',
    entries: [entry()],
    ...overrides,
  };
}

describe('formatBahnDate', () => {
  it('renders an ISO date in German long form', () => {
    expect(formatBahnDate('2026-07-17')).toBe('Fr., 17. Juli 2026');
  });

  it('passes a non-date string through rather than showing "Invalid Date"', () => {
    expect(formatBahnDate('morgen')).toBe('morgen');
  });

  it('is null when the backend could not derive a date', () => {
    expect(formatBahnDate(null)).toBeNull();
  });
});

describe('trainLabel', () => {
  it('prefers the line label', () => {
    expect(trainLabel(entry({ line: 'RE8' }))).toBe('RE8');
  });

  it('falls back to category plus number', () => {
    expect(trainLabel(entry({ line: null }))).toBe('ICE 204');
  });

  it('does not leave a trailing space when the number is missing', () => {
    expect(trainLabel(entry({ line: null, number: '' }))).toBe('ICE');
  });
});

describe('toRow', () => {
  // The pairing matters: taking the two independently prints the arrival time
  // beside the departure platform, which are two different events.
  it('falls back to the arrival for a terminating train, platform included', () => {
    const row = toRow(
      entry({
        departureTime: null,
        departurePlatform: '7',
        arrivalTime: '10:02',
        arrivalPlatform: '3',
      })
    );

    expect(row.time).toBe('10:02');
    expect(row.platform).toBe('3');
  });

  it('keeps the departure platform when there is a departure', () => {
    const row = toRow(entry({ departurePlatform: '7', arrivalPlatform: '3' }));

    expect(row.time).toBe('09:14');
    expect(row.platform).toBe('7');
  });

  it('shows a dash rather than an empty slot when neither time is known', () => {
    expect(toRow(entry({ departureTime: null, arrivalTime: null })).time).toBe('–');
  });

  it('drops the destination out of the via list', () => {
    const row = toRow(entry({ via: ['Spandau', 'Wolfsburg', 'Hamburg Hbf'] }));

    expect(row.via).toEqual(['Spandau', 'Wolfsburg']);
  });

  it('substitutes an em dash for an unknown destination', () => {
    expect(toRow(entry({ destination: null })).destination).toBe('—');
  });
});

describe('buildBahnCardView', () => {
  it('names the hour window when there is one', () => {
    expect(buildBahnCardView(payload()).subtitle).toBe('Abfahrten ab 09 Uhr');
  });

  it('stays generic without one', () => {
    expect(buildBahnCardView(payload({ hour: null })).subtitle).toBe('Abfahrten');
  });

  it('caps the rows and counts the rest', () => {
    const entries = Array.from({ length: MAX_ROWS + 3 }, (_, i) => entry({ id: `e${i}` }));

    const view = buildBahnCardView(payload({ entries }));

    expect(view.rows).toHaveLength(MAX_ROWS);
    expect(view.hiddenCount).toBe(3);
  });

  it('reports no overflow when everything fits', () => {
    expect(buildBahnCardView(payload()).hiddenCount).toBe(0);
  });

  it('flags an empty board so the card can say so instead of rendering nothing', () => {
    const view = buildBahnCardView(payload({ entries: [] }));

    expect(view.isEmpty).toBe(true);
    expect(view.hiddenCount).toBe(0);
  });
});
