import { describe, it, expect } from 'vitest';

import { createSourceRegistry } from './sourceRegistry.js';

import type { SearchResult } from '../../../../agents/langgraph/ChatGraph/types.js';

const reg = () => createSourceRegistry();

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

  // Without the URL in the line, a generating model (PDF/deck/sheet) can cite
  // [N] but cannot reproduce the link — "PDF mit den Originalquellen" then
  // renders invented placeholder URLs.
  it('puts the source URL in the snippet line the model reads', () => {
    const reg = createSourceRegistry();
    const block = reg.register([
      result({ url: 'https://bfn.de/artenschutz', title: 'BfN', content: 'alpha' }),
    ]);
    expect(block).toBe('[1] BfN <https://bfn.de/artenschutz> — alpha');
    expect(reg.renderAll()).toContain('https://bfn.de/artenschutz');
  });

  it('omits the URL segment for sources that have none', () => {
    const reg = createSourceRegistry();
    expect(reg.register([result({ title: 'A', content: 'alpha' })])).toBe('[1] A — alpha');
  });

  it('collapses exact duplicates so numbering stays stable', () => {
    const reg = createSourceRegistry();
    reg.register([result({ url: 'https://x', title: 'A', content: 'alpha' })]);
    const dup = reg.register([result({ url: 'https://x', title: 'A', content: 'alpha' })]);
    expect(dup).toBe(''); // nothing new added
    expect(reg.size).toBe(1);
  });

  // Stufe 3: the default cap must cover a whole indexed chunk. Documents are
  // chunked at 400-500 tokens (~1400-1750 chars); at the old 320 we embedded,
  // stored and searched a chunk, then showed the model a quarter of it.
  it('shows a whole retrieved chunk, not a quarter of it', () => {
    const chunk = `ANFANG ${'x'.repeat(1200)} SCHLUSS`;
    const block = reg().register([result({ title: 'Doc', content: chunk })]);
    expect(block).toContain('ANFANG');
    expect(block).toContain('SCHLUSS');
  });

  it('still truncates something far larger than a chunk', () => {
    const huge = `ANFANG ${'x'.repeat(40_000)} ENDE`;
    const block = reg().register([result({ title: 'Doc', content: huge })]);
    expect(block).toContain('ANFANG');
    expect(block).not.toContain('ENDE');
  });

  it('honors a per-registration snippetChars override in the block and renderAll', () => {
    const registry = createSourceRegistry();
    const long = `Anfang ${'x'.repeat(3_000)} ENDE`;
    registry.register([result({ title: 'Kurz', content: `k ${'y'.repeat(3_000)} SCHLUSS` })]);
    const block = registry.register([result({ title: 'Lang', content: long })], {
      snippetChars: 6_000,
    });
    // The default cap truncates the first source; the override keeps the second
    // intact — and renderAll must honor the per-result cap, not re-apply the default.
    expect(block).toContain('ENDE');
    const all = registry.renderAll();
    expect(all).not.toContain('SCHLUSS');
    expect(all).toContain('ENDE');
  });

  // scrape_url uses this to read a whole page; a search hit must not.
  it('lets a crawl-sized override carry a full page', () => {
    const page = `SEITENANFANG ${'x'.repeat(20_000)} SEITENENDE`;
    const block = reg().register([result({ title: 'Artikel', content: page })], {
      snippetChars: 25_000,
    });
    expect(block).toContain('SEITENANFANG');
    expect(block).toContain('SEITENENDE');
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

  describe('cross-turn carried sources (seedCarried / renderReference)', () => {
    it('carried sources appear in renderReference but NOT in renderAll/getCitations/getResults', () => {
      const reg = createSourceRegistry();
      reg.seedCarried([result({ title: 'PRIOR', content: 'prior-fact', url: 'https://p' })]);
      // renderReference exposes the carried source to the op-planner...
      expect(reg.renderReference()).toMatch(/\[1\] PRIOR/);
      // ...but this-turn channels stay empty (no dangling citation, no push-out).
      expect(reg.renderAll()).toBe('');
      expect(reg.getCitations()).toEqual([]);
      expect(reg.getResults()).toEqual([]);
      expect(reg.size).toBe(0);
    });

    it('renderReference lists carried first, then this-turn sources, sequentially numbered', () => {
      const reg = createSourceRegistry();
      reg.seedCarried([result({ title: 'PRIOR', content: 'prior', url: 'https://p' })]);
      reg.register([result({ title: 'FRESH', content: 'fresh', url: 'https://f' })]);
      const ref = reg.renderReference();
      expect(ref).toMatch(/\[1\] PRIOR/);
      expect(ref).toMatch(/\[2\] FRESH/);
    });

    it('renderReference dedups a carried source re-found this turn', () => {
      const reg = createSourceRegistry();
      reg.seedCarried([result({ title: 'A', content: 'alpha', url: 'https://a' })]);
      reg.register([result({ title: 'A', content: 'alpha', url: 'https://a' })]);
      const ref = reg.renderReference();
      expect(ref).toBe('[1] A <https://a> — alpha');
      // this-turn citation still counts the fresh registration (it was cited live)
      expect(reg.size).toBe(1);
    });

    it('seedCarried skips empty-content sources', () => {
      const reg = createSourceRegistry();
      reg.seedCarried([result({ title: 'Empty', content: '', url: 'https://e' })]);
      expect(reg.renderReference()).toBe('');
    });

    it('renderReference falls back to this-turn sources when nothing carried', () => {
      const reg = createSourceRegistry();
      reg.register([result({ title: 'ONLY', content: 'only', url: 'https://o' })]);
      expect(reg.renderReference()).toMatch(/\[1\] ONLY/);
    });
  });
});
