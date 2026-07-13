import { describe, it, expect } from 'vitest';

import { createSourceRegistry } from './sourceRegistry.js';

import type { SearchResult } from '../../../../agents/langgraph/ChatGraph/types.js';

function result(over: Partial<SearchResult>): SearchResult {
  return { source: 'test', title: 't', content: 'c', ...over };
}

describe('createSourceRegistry', () => {
  it('numbers snippets sequentially across register() calls', () => {
    const reg = createSourceRegistry();
    const block1 = reg.register([result({ title: 'A', content: 'alpha' })]);
    const block2 = reg.register([result({ title: 'B', content: 'beta' })]);
    expect(block1).toMatch(/^\[1\] A/);
    expect(block2).toMatch(/^\[2\] B/);
    expect(reg.size).toBe(2);
  });

  it('collapses exact duplicates so numbering stays stable', () => {
    const reg = createSourceRegistry();
    reg.register([result({ url: 'https://x', title: 'A', content: 'alpha' })]);
    const dup = reg.register([result({ url: 'https://x', title: 'A', content: 'alpha' })]);
    expect(dup).toBe(''); // nothing new added
    expect(reg.size).toBe(1);
  });

  it('builds citations over the accumulated results', () => {
    const reg = createSourceRegistry();
    reg.register([
      result({ title: 'A', content: 'alpha', url: 'https://a' }),
      result({ title: 'B', content: 'beta', url: 'https://b' }),
    ]);
    const citations = reg.getCitations();
    expect(citations.length).toBeGreaterThan(0);
    expect(citations[0]).toHaveProperty('id');
  });

  it('citation ids match the snippet numbers in registry order (no relevance re-sort)', () => {
    const reg = createSourceRegistry();
    // Register out of relevance order — buildCitations would re-sort these, but
    // the registry must keep the numbering the model was shown.
    reg.register([
      result({ title: 'A', content: 'alpha', url: 'https://a', relevance: 0.1 }),
      result({ title: 'B', content: 'beta', url: 'https://b', relevance: 0.9 }),
    ]);
    const citations = reg.getCitations();
    expect(citations.map((c) => c.id)).toEqual([1, 2]);
    // id 1 must be the first-registered source (A), not the higher-relevance B.
    expect(citations[0].title).toContain('A');
  });

  it('skips empty-content results so [N] stays in lockstep with citations', () => {
    const reg = createSourceRegistry();
    const block = reg.register([
      result({ title: 'A', content: 'alpha', url: 'https://a' }),
      result({ title: 'Empty', content: '', url: 'https://e' }),
      result({ title: 'B', content: 'beta', url: 'https://b' }),
    ]);
    // The empty-content source is neither numbered nor cited.
    expect(block).toMatch(/\[1\] A/);
    expect(block).toMatch(/\[2\] B/);
    expect(block).not.toContain('Empty');
    expect(reg.getCitations().map((c) => c.id)).toEqual([1, 2]);
  });

  it('caps getResults() to the requested limit', () => {
    const reg = createSourceRegistry();
    reg.register(
      Array.from({ length: 30 }, (_, i) =>
        result({ title: `T${i}`, content: `c${i}`, url: `u${i}` })
      )
    );
    expect(reg.getResults(10)).toHaveLength(10);
  });
});
