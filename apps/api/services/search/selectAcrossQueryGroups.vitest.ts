import { describe, expect, it } from 'vitest';

import {
  filterAndSortResults,
  selectAcrossQueryGroups,
  toClientSource,
} from './SearchResultProcessor.js';

import type { ExpandedChunkResult } from './types.js';

const chunk = (
  doc: string,
  chunkIndex: number,
  similarity: number,
  collectionId?: string
): ExpandedChunkResult => ({
  document_id: doc,
  source_url: null,
  title: doc,
  snippet: `${doc}#${chunkIndex}`,
  filename: null,
  similarity,
  chunk_index: chunkIndex,
  page_number: null,
  ...(collectionId && { collection_id: collectionId }),
});

const ids = (results: ExpandedChunkResult[]): string[] =>
  results.map((r) => `${r.document_id}#${r.chunk_index}`);

describe('selectAcrossQueryGroups', () => {
  it('behaves exactly like filterAndSortResults for a single group', () => {
    const group = [chunk('a', 0, 0.9), chunk('b', 0, 0.4), chunk('c', 0, 0.2)];
    const options = { threshold: 0.35, limit: 10 };

    expect(selectAcrossQueryGroups([group], options)).toEqual(filterAndSortResults(group, options));
  });

  it('gives a weak-scoring sub-question a slot before a strong one takes a second', () => {
    // The failure this exists to prevent: sub-question B's evidence scores
    // lower than everything A found, so a flat top-3 answers A three times and
    // reports "not in the sources" for B.
    const strong = [chunk('a', 0, 0.9), chunk('a', 1, 0.88), chunk('a', 2, 0.86)];
    const weak = [chunk('b', 0, 0.42)];

    const selected = selectAcrossQueryGroups([strong, weak], { threshold: 0.35, limit: 3 });

    expect(ids(selected)).toContain('b#0');
    expect(selected).toHaveLength(3);
  });

  it('round-robins so every group gets its turn before anyone gets seconds', () => {
    const g1 = [chunk('a', 0, 0.9), chunk('a', 1, 0.85)];
    const g2 = [chunk('b', 0, 0.8), chunk('b', 1, 0.75)];
    const g3 = [chunk('c', 0, 0.7), chunk('c', 1, 0.65)];

    const selected = selectAcrossQueryGroups([g1, g2, g3], { threshold: 0.35, limit: 6 });

    expect(ids(selected).slice(0, 3)).toEqual(['a#0', 'b#0', 'c#0']);
    expect(ids(selected).slice(3)).toEqual(['a#1', 'b#1', 'c#1']);
  });

  it('never returns the same chunk twice when groups overlap', () => {
    const g1 = [chunk('a', 0, 0.9), chunk('shared', 0, 0.8)];
    const g2 = [chunk('shared', 0, 0.8), chunk('b', 0, 0.7)];

    const selected = selectAcrossQueryGroups([g1, g2], { threshold: 0.35, limit: 10 });

    expect(ids(selected)).toHaveLength(new Set(ids(selected)).size);
    expect(ids(selected).sort()).toEqual(['a#0', 'b#0', 'shared#0']);
  });

  it('treats same chunk index in different collections as different chunks', () => {
    const g1 = [chunk('doc', 0, 0.9, 'col-1')];
    const g2 = [chunk('doc', 0, 0.9, 'col-2')];

    expect(selectAcrossQueryGroups([g1, g2], { threshold: 0.35, limit: 10 })).toHaveLength(2);
  });

  it('drops chunks below the threshold in every group', () => {
    const g1 = [chunk('a', 0, 0.9), chunk('a', 1, 0.1)];
    const g2 = [chunk('b', 0, 0.2)];

    const selected = selectAcrossQueryGroups([g1, g2], { threshold: 0.35, limit: 10 });

    expect(ids(selected)).toEqual(['a#0']);
  });

  it('keeps filling from the groups that still have candidates', () => {
    const g1 = [chunk('a', 0, 0.9), chunk('a', 1, 0.85), chunk('a', 2, 0.8)];
    const g2 = [chunk('b', 0, 0.7)];

    const selected = selectAcrossQueryGroups([g1, g2], { threshold: 0.35, limit: 4 });

    expect(ids(selected)).toEqual(['a#0', 'b#0', 'a#1', 'a#2']);
  });

  it('handles empty input and all-empty groups', () => {
    expect(selectAcrossQueryGroups([], { limit: 5 })).toEqual([]);
    expect(selectAcrossQueryGroups([[], []], { limit: 5 })).toEqual([]);
  });

  it('ranks paraphrases of one question by score, since they share a group', () => {
    // Paraphrases must NOT get a fair share each — a weak hit from a worse
    // rewording would take a slot from a stronger hit of the best one. The
    // caller merges them into a single group; this pins that this then behaves
    // as plain score ordering.
    const paraphraseGroup = [chunk('best', 0, 0.9), chunk('best', 1, 0.88), chunk('worse', 0, 0.4)];

    expect(ids(selectAcrossQueryGroups([paraphraseGroup], { threshold: 0.35, limit: 2 }))).toEqual([
      'best#0',
      'best#1',
    ]);
  });
});

describe('toClientSource', () => {
  it('drops chunk_text and keeps everything the client renders', () => {
    const withText = { ...chunk('a', 0, 0.9), chunk_text: 'the full 1600-character chunk' };

    const client = toClientSource(withText);

    expect(client).not.toHaveProperty('chunk_text');
    expect(client.snippet).toBe('a#0');
    expect(client.document_id).toBe('a');
    expect(client.similarity).toBe(0.9);
  });

  it('is a no-op for a result that never carried one', () => {
    expect(toClientSource(chunk('a', 0, 0.9))).toEqual(chunk('a', 0, 0.9));
  });
});
