import { describe, expect, it } from 'vitest';

import { type FilterFieldConfig } from '../manual-search/useResearchFilters';

import { buildSystemTargets } from './omniIntent';
import {
  describeParsedFilters,
  parseResearchIntent,
  type ParseContext,
} from './parseResearchIntent';

const targets = buildSystemTargets();

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
  content_type: {
    label: 'Typ',
    type: 'keyword',
    values: [
      { value: 'beschluss', count: 20 },
      { value: 'antrag', count: 15 },
      { value: 'presse', count: 8 },
    ],
    valueLabels: { beschluss: 'Beschluss', antrag: 'Antrag', presse: 'Presse' },
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

  it('extracts the content type from "beschlossen"', () => {
    expect(parsed.filters['content_type']).toEqual(['beschluss']);
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

  it('bare year → that whole year', () => {
    expect(dateOf('was wurde 2024 beschlossen')).toEqual({
      date_from: '2024-01-01',
      date_to: '2024-12-31',
    });
  });

  it('does not read round quantities as years', () => {
    // 2000 is outside the recent bare-year window → not a date.
    expect(dateOf('was fordern die grünen für über 2000 geflüchtete')).toBeUndefined();
  });
});

describe('describeParsedFilters', () => {
  it('enumerates region, date, theme, type in stable order', () => {
    const parsed = parseResearchIntent('was hat berlin seit 2023 zu klima beschlossen', ctx);
    expect(describeParsedFilters(parsed).map((c) => c.key)).toEqual([
      'region',
      'published_at',
      'themes',
      'content_type',
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

  it('only emits content types the collections actually carry', () => {
    const noTypes: ParseContext = { targets, filterFields: { themes: filterFields.themes } };
    // 'content_type' facet absent → availableTypes empty → lexicon still allowed,
    // but with an EMPTY content_type facet present it must be gated out:
    const gated = parseResearchIntent('pressemitteilung zu klima', {
      targets,
      filterFields: { content_type: { label: 'Typ', type: 'keyword', values: [] } },
    });
    expect(gated.filters['content_type']).toBeUndefined();
    // With no content_type config at all, the lexicon is ungated (best-effort).
    expect(parseResearchIntent('antrag zu klima', noTypes).filters['content_type']).toEqual([
      'antrag',
    ]);
  });

  it('returns no structure for a plain keyword', () => {
    const parsed = parseResearchIntent('hitzeschutz', ctx);
    expect(parsed.hasStructure).toBe(false);
    expect(parsed.collectionIds).toBeUndefined();
    expect(Object.keys(parsed.filters)).toEqual([]);
  });
});
