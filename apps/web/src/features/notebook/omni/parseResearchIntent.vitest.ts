import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { datePresets } from '../manual-search/datePresets';
import { type FilterFieldConfig } from '../manual-search/useResearchFilters';

import { buildSystemTargets } from './omniIntent';
import {
  describeParsedFilters,
  parseResearchIntent,
  type ParseContext,
} from './parseResearchIntent';

const targets = buildSystemTargets('de-DE');

// Minimal facet vocabulary, shaped like what useResearchFilters delivers at runtime.
const filterFields: Record<string, FilterFieldConfig> = {
  themes: {
    label: 'Themen',
    type: 'keyword',
    values: [
      { value: 'klima', count: 42 },
      { value: 'verkehr', count: 30 },
      { value: 'soziales', count: 12 },
    ],
    valueLabels: { klima: 'Klima', verkehr: 'Verkehr', soziales: 'Soziales' },
  },
  persons: {
    label: 'Personen',
    type: 'keyword',
    values: [
      { value: 'Robert Habeck', count: 9 },
      { value: 'Annalena Baerbock', count: 7 },
      { value: 'Habeck', count: 3 },
    ],
  },
};

const ctx: ParseContext = { targets, filterFields };

describe('parseResearchIntent — headline example', () => {
  const parsed = parseResearchIntent('was hat berlin seit 2023 zu thema klima beschlossen', ctx);

  it('scopes to the Berlin system collection', () => {
    expect(parsed.collectionIds).toEqual(['berlin-system']);
    expect(parsed.matched.region).toBe('Berlin');
  });

  it('extracts the date floor', () => {
    expect(parsed.filters['published_at']).toEqual({ date_from: '2023-01-01' });
  });

  it('extracts the theme from the facet vocabulary', () => {
    expect(parsed.filters['themes']).toEqual(['klima']);
    expect(parsed.matched.themes).toEqual(['Klima']);
  });

  it('does not emit a content_type filter (parser no longer guesses types)', () => {
    expect(parsed.filters['content_type']).toBeUndefined();
  });

  it('keeps the full query for semantic recall and flags structure', () => {
    expect(parsed.semanticQuery).toBe('was hat berlin seit 2023 zu thema klima beschlossen');
    expect(parsed.hasStructure).toBe(true);
  });
});

describe('parseResearchIntent — date phrasings', () => {
  const dateOf = (q: string) => parseResearchIntent(q, ctx).filters['published_at'];

  it('seit Monat YYYY → month floor', () => {
    expect(dateOf('anträge seit Januar 2024')).toEqual({ date_from: '2024-01-01' });
  });

  it('bis YYYY → year ceiling', () => {
    expect(dateOf('beschlüsse bis 2022')).toEqual({ date_to: '2022-12-31' });
  });

  it('zwischen X und Y → full range', () => {
    expect(dateOf('klima zwischen 2021 und 2023')).toEqual({
      date_from: '2021-01-01',
      date_to: '2023-12-31',
    });
  });

  it('von X bis Y → full range', () => {
    expect(dateOf('beschlüsse von 2022 bis 2024')).toEqual({
      date_from: '2022-01-01',
      date_to: '2024-12-31',
    });
  });

  it('does not treat a bare year as a date (must be keyword-anchored)', () => {
    // A standalone year is too often not a date ("Drucksache 2020", "2024 Stimmen").
    expect(dateOf('was wurde 2024 beschlossen')).toBeUndefined();
    expect(dateOf('was fordern die grünen für über 2000 geflüchtete')).toBeUndefined();
  });
});

describe('describeParsedFilters', () => {
  it('enumerates region, date, theme in stable order', () => {
    const parsed = parseResearchIntent('was hat berlin seit 2023 zu klima beschlossen', ctx);
    expect(describeParsedFilters(parsed).map((c) => c.key)).toEqual([
      'region',
      'published_at',
      'themes',
    ]);
  });
});

describe('parseResearchIntent — scope + recency + empties', () => {
  it('skips region detection when the scope is fixed (inside a notebook)', () => {
    const parsed = parseResearchIntent('berlin seit 2023 zu klima', { ...ctx, scopeFixed: true });
    expect(parsed.collectionIds).toBeUndefined();
    expect(parsed.filters['published_at']).toEqual({ date_from: '2023-01-01' });
    expect(parsed.filters['themes']).toEqual(['klima']);
  });

  it('maps recency words to date_desc sort', () => {
    expect(parseResearchIntent('neueste beschlüsse zu verkehr', ctx).sortBy).toBe('date_desc');
  });

  it('returns no structure for a plain keyword', () => {
    const parsed = parseResearchIntent('hitzeschutz', ctx);
    expect(parsed.hasStructure).toBe(false);
    expect(parsed.collectionIds).toBeUndefined();
    expect(Object.keys(parsed.filters)).toEqual([]);
  });
});

describe('parseResearchIntent — relative dates (clock pinned to 2026-09-27)', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 27, 12, 0, 0));
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  const parse = (q: string) => parseResearchIntent(q, ctx);

  it.each([
    ['anträge seit 30 Tagen', { date_from: '2026-08-28' }, 'Letzte 30 Tage'],
    ['beschlüsse der letzten 30 Tage', { date_from: '2026-08-28' }, 'Letzte 30 Tage'],
    ['in den letzten zwei Wochen', { date_from: '2026-09-13' }, 'Letzte 2 Wochen'],
    ['seit drei Monaten', { date_from: '2026-06-27' }, 'Letzte 3 Monate'],
    ['letzte 12 Monate zu klima', { date_from: '2025-09-27' }, 'Letzte 12 Monate'],
    ['was kam letzte Woche', { date_from: '2026-09-20' }, 'Letzte Woche'],
    ['beschlüsse im letzten Monat', { date_from: '2026-08-27' }, 'Letzter Monat'],
    ['was hat sich dieses Jahr getan', { date_from: '2026-01-01', date_to: '2026-12-31' }, '2026'],
    ['in diesem Jahr', { date_from: '2026-01-01', date_to: '2026-12-31' }, '2026'],
    ['anträge letztes Jahr', { date_from: '2025-01-01', date_to: '2025-12-31' }, '2025'],
    ['im letzten Jahr', { date_from: '2025-01-01', date_to: '2025-12-31' }, '2025'],
    ['vergangenes Jahr', { date_from: '2025-01-01', date_to: '2025-12-31' }, '2025'],
    ['anträge aus 2023', { date_from: '2023-01-01', date_to: '2023-12-31' }, '2023'],
    ['im Jahr 2021 beschlossen', { date_from: '2021-01-01', date_to: '2021-12-31' }, '2021'],
  ])('%s', (q, range, label) => {
    const parsed = parse(q);
    expect(parsed.filters['published_at']).toEqual(range);
    expect(parsed.matched.dateLabel).toBe(label);
  });

  it('labels and ranges equal the toolbar presets they coincide with', () => {
    const presets = datePresets(new Date());
    const byLabel = (l: string) => presets.find((p) => p.label === l)?.range;
    expect(parse('seit 30 Tagen').filters['published_at']).toEqual(byLabel('Letzte 30 Tage'));
    expect(parse('letzte 12 Monate').filters['published_at']).toEqual(byLabel('Letzte 12 Monate'));
    expect(parse('dieses Jahr').filters['published_at']).toEqual(byLabel('2026'));
    expect(parse('letztes Jahr').filters['published_at']).toEqual(byLabel('2025'));
  });

  it('keeps the existing letzte-N-Jahre pattern on the pinned clock', () => {
    expect(parse('in den letzten 2 Jahren').filters['published_at']).toEqual({
      date_from: '2024-01-01',
    });
  });
});

describe('parseResearchIntent — persons', () => {
  it('matches multi-word names from the facet vocabulary', () => {
    const parsed = parseResearchIntent('was sagt robert habeck zu klima', ctx);
    expect(parsed.filters['persons']).toEqual(['Robert Habeck']);
    expect(parsed.matched.persons).toEqual(['Robert Habeck']);
    expect(parsed.hasStructure).toBe(true);
  });

  it('ignores single-word facet values', () => {
    expect(parseResearchIntent('was sagt habeck', ctx).filters['persons']).toBeUndefined();
  });

  it('does not match a name only as part of a longer word', () => {
    expect(parseResearchIntent('annalena baerbocks rede', ctx).filters['persons']).toBeUndefined();
  });

  it('adds a persons chip after the themes chip', () => {
    const parsed = parseResearchIntent('annalena baerbock seit 2023 zu klima', ctx);
    expect(describeParsedFilters(parsed)).toEqual([
      { key: 'published_at', label: 'seit 2023' },
      { key: 'themes', label: 'Klima' },
      { key: 'persons', label: 'Annalena Baerbock' },
    ]);
  });
});

describe('parseResearchIntent — residualQuery', () => {
  const residual = (q: string) => parseResearchIntent(q, ctx).residualQuery;

  it('drops the date phrase and filler words, keeps themes and persons', () => {
    expect(residual('Alle Beiträge zu Klima seit 2023')).toBe('zu Klima');
    expect(residual('Robert Habeck, Dokumente aus 2023?')).toBe('Robert Habeck');
  });

  it('drops recency words (they became a sort)', () => {
    expect(residual('neueste Beschlüsse zu Verkehr')).toBe('Beschlüsse zu Verkehr');
  });

  it('keeps the original casing and inner words', () => {
    expect(residual('Was hat Berlin zwischen 2021 und 2023 zum Klima beschlossen')).toBe(
      'Was hat Berlin zum Klima beschlossen'
    );
  });

  it('only drops filler words that stand alone', () => {
    expect(residual('Artikelserie zu Textilien')).toBe('Artikelserie zu Textilien');
  });

  it('falls back to the full query when nothing is left', () => {
    expect(residual('  alle Dokumente seit 2023 ')).toBe('alle Dokumente seit 2023');
  });

  it('keeps semanticQuery as the full trimmed query', () => {
    expect(parseResearchIntent(' alle Beiträge seit 2023 ', ctx).semanticQuery).toBe(
      'alle Beiträge seit 2023'
    );
  });
});
