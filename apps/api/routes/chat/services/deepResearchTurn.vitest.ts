/**
 * The one thing in the `@deepresearch` path that cannot be checked by reading it:
 * Linkup numbers its `[N]` against ITS OWN source order, and our registry
 * renumbers from scratch. If those two ever disagree, every attribution in the
 * dossier points at the wrong source — silently, and in a text a user was told is
 * sourced. That is the exact failure that got the old research card abandoned.
 *
 * So these tests assert the coupling against the REAL registry
 * (`buildCitations` → `buildCitableSources`), not a stand-in: the hazards live in
 * that module's sort and dedup, and a fake would reproduce neither.
 */

import { describe, it, expect } from 'vitest';

import { buildCitations } from '../../../agents/langgraph/ChatGraph/nodes/citationUtils.js';

import { toRegistryOrderedSources } from './deepResearchTurn.js';

import type { LinkupSource } from '../../../services/search/LinkupService.js';

const source = (n: number, url?: string): LinkupSource => ({
  name: `Quelle ${n}`,
  url: url ?? `https://example.org/${n}`,
  snippet: `Inhalt der Quelle ${n} mit genug Text, dass sie zitierfähig ist.`,
});

describe('toRegistryOrderedSources — Linkup order survives into the registry', () => {
  it('numbers citations in Linkup order, not by relevance', () => {
    const results = toRegistryOrderedSources([1, 2, 3, 4, 5].map((n) => source(n)));
    const citations = buildCitations(results);

    expect(citations.map((c) => c.id)).toEqual([1, 2, 3, 4, 5]);
    // [N] must name the Nth source Linkup listed.
    expect(citations.map((c) => c.title)).toEqual([
      'Quelle 1',
      'Quelle 2',
      'Quelle 3',
      'Quelle 4',
      'Quelle 5',
    ]);
  });

  it('assigns strictly decreasing relevance so the registry sort is a no-op', () => {
    const results = toRegistryOrderedSources([1, 2, 3].map((n) => source(n)));
    const scores = results.map((r) => r.relevance ?? 0);
    // Equal scores would let the sort reorder ties freely — the whole point of
    // the synthetic score is that no two are equal.
    expect(scores[0]).toBeGreaterThan(scores[1]!);
    expect(scores[1]).toBeGreaterThan(scores[2]!);
  });

  it('collapses duplicate URLs BEFORE numbering, so later numbers do not shift', () => {
    // Registry dedup is keyed on URL. Left to it, source 2 and 3 would merge and
    // "Quelle 4" would silently become [3] — misattributing the rest of the text.
    const results = toRegistryOrderedSources([
      source(1, 'https://example.org/a'),
      source(2, 'https://example.org/b'),
      source(3, 'https://example.org/b'),
      source(4, 'https://example.org/c'),
    ]);
    const citations = buildCitations(results);

    expect(results).toHaveLength(3);
    expect(citations.map((c) => c.title)).toEqual(['Quelle 1', 'Quelle 2', 'Quelle 4']);
  });

  it('keeps URL-less sources — they cannot collide and the dossier may cite them', () => {
    const results = toRegistryOrderedSources([
      { name: 'Ohne URL', url: '', snippet: 'Ein Fundstück ohne Adresse.' },
      { name: 'Auch ohne', url: '', snippet: 'Noch ein Fundstück ohne Adresse.' },
    ]);
    expect(results.map((r) => r.title)).toEqual(['Ohne URL', 'Auch ohne']);
  });

  it('caps at the registry ceiling instead of letting the registry drop the tail', () => {
    const many = Array.from({ length: 30 }, (_, i) => source(i + 1));
    const results = toRegistryOrderedSources(many);
    // 20 = MAX_SOURCES in citableSources.ts. Truncating here makes the loss
    // loggable; leaving it to the registry made it invisible.
    expect(results).toHaveLength(20);
    expect(buildCitations(results)).toHaveLength(20);
    expect(results[19]?.title).toBe('Quelle 20');
  });

  it('falls back to the URL as title when Linkup sends no name', () => {
    const results = toRegistryOrderedSources([
      { name: '', url: 'https://example.org/x', snippet: 'Inhalt' },
    ]);
    expect(results[0]?.title).toBe('https://example.org/x');
  });
});
