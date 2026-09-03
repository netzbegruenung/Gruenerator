import { describe, it, expect } from 'vitest';

import { buildContextSummary } from './contextSummary.js';

import type { ReferencesMap } from './types.js';

const ref = (over: Partial<ReferencesMap[string]>): ReferencesMap[string] => ({
  title: 'Wahlprogramm',
  snippets: [['Windkraft massiv ausbauen']],
  description: null,
  date: null,
  source: 'grundsatz',
  document_id: 'doc-1',
  source_url: null,
  filename: null,
  similarity_score: 0.8,
  chunk_index: 0,
  page_number: null,
  ...over,
});

describe('buildContextSummary', () => {
  it('leads with today and tags each dated source', () => {
    const map: ReferencesMap = {
      '1': ref({ date: '2025-03-15', collection_name: 'Grundsatz' }),
      '2': ref({ title: 'Antrag', date: null }),
    };
    const out = buildContextSummary(map, new Date('2026-09-02T12:00:00Z'));
    expect(out.startsWith('Heutiges Datum: 2. September 2026\n\n')).toBe(true);
    expect(out).toContain(
      '1. [Grundsatz] (Datum: März 2025) Wahlprogramm — "Windkraft massiv ausbauen"'
    );
    expect(out).toContain('2. Antrag — "Windkraft massiv ausbauen"');
  });
});
