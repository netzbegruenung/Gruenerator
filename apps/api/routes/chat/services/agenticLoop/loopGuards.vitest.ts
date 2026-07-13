import { describe, it, expect } from 'vitest';

import {
  createToolLoopGuards,
  MAX_FAILURES_PER_TOOL,
  MAX_TOTAL_FAILURES,
  MAX_SEARCH_CALLS,
  MAX_SOURCES,
} from './loopGuards.js';

describe('createToolLoopGuards — duplicate detection', () => {
  it('flags an identical repeat (both scopes)', () => {
    for (const duplicateScope of ['turn', 'consecutive'] as const) {
      const guards = createToolLoopGuards({ duplicateScope });
      const input = { query: 'a' };
      expect(guards.checkDuplicate('search', input)).toBeNull();
      expect(guards.checkDuplicate('search', input)).not.toBeNull();
    }
  });

  it('turn scope: flags NON-consecutive repeats across the whole turn', () => {
    const guards = createToolLoopGuards();
    expect(guards.checkDuplicate('search', { query: 'klima' })).toBeNull();
    expect(guards.checkDuplicate('web', { query: 'klima news' })).toBeNull();
    // Same search again later in the turn — blocked.
    expect(guards.checkDuplicate('search', { query: 'klima' })).not.toBeNull();
  });

  it('turn scope: normalizes case, punctuation and token order', () => {
    const guards = createToolLoopGuards();
    expect(guards.checkDuplicate('search', { query: 'Klimapolitik der Grünen' })).toBeNull();
    expect(guards.checkDuplicate('search', { query: 'grünen, klimapolitik: der!' })).not.toBeNull();
    expect(
      guards.checkDuplicate('search', { query: '  DER   Grünen Klimapolitik ' })
    ).not.toBeNull();
    // A genuinely different query passes.
    expect(guards.checkDuplicate('search', { query: 'Tempolimit Autobahn' })).toBeNull();
  });

  it('turn scope: the error message names what was already searched', () => {
    const guards = createToolLoopGuards();
    guards.checkDuplicate('search', { query: 'Kindergrundsicherung Position' });
    const error = guards.checkDuplicate('search', { query: 'Position Kindergrundsicherung' });
    expect(error).toContain('Kindergrundsicherung Position');
  });

  it('turn scope: same query on a DIFFERENT tool is allowed', () => {
    const guards = createToolLoopGuards();
    expect(guards.checkDuplicate('search', { query: 'klima' })).toBeNull();
    expect(guards.checkDuplicate('web', { query: 'klima' })).toBeNull();
  });

  it('consecutive scope: only compares against the immediately previous call', () => {
    const guards = createToolLoopGuards({ duplicateScope: 'consecutive' });
    expect(guards.checkDuplicate('read', {})).toBeNull();
    // A different tool in between means the earlier {} is no longer "last".
    expect(guards.checkDuplicate('apply', {})).toBeNull();
    expect(guards.checkDuplicate('read', {})).toBeNull();
  });

  it('consecutive scope: does NOT normalize (exact match only)', () => {
    const guards = createToolLoopGuards({ duplicateScope: 'consecutive' });
    expect(guards.checkDuplicate('apply', { text: 'Zeile 1' })).toBeNull();
    expect(guards.checkDuplicate('apply', { text: '1 Zeile' })).toBeNull();
  });

  // ── battle-test edges ──

  it('umlauts survive normalization ("Grüne" ≠ "Grune", but casing collides)', () => {
    const guards = createToolLoopGuards();
    expect(guards.checkDuplicate('search', { query: 'GRÜNE Klimapolitik' })).toBeNull();
    expect(guards.checkDuplicate('search', { query: 'grüne klimapolitik' })).not.toBeNull();
    // Umlaut-stripped spelling is a DIFFERENT query (must stay allowed — the
    // MCP guidance explicitly suggests retrying umlaut-free).
    expect(guards.checkDuplicate('search', { query: 'grune klimapolitik' })).toBeNull();
  });

  it('object key order and nesting do not defeat the dedup', () => {
    const guards = createToolLoopGuards();
    expect(
      guards.checkDuplicate('search', { query: 'tempolimit', filters: { land: 'Bayern' } })
    ).toBeNull();
    expect(
      guards.checkDuplicate('search', { filters: { land: 'bayern!' }, query: 'Tempolimit' })
    ).not.toBeNull();
  });

  it('re-ordered URL arrays collide (same scrape twice)', () => {
    const guards = createToolLoopGuards();
    expect(
      guards.checkDuplicate('scrape_url', { urls: ['https://a.de', 'https://b.de'] })
    ).toBeNull();
    expect(
      guards.checkDuplicate('scrape_url', { urls: ['https://b.de', 'https://a.de'] })
    ).not.toBeNull();
  });

  it('punctuation-only queries normalize to the same empty key (garbage collides)', () => {
    const guards = createToolLoopGuards();
    expect(guards.checkDuplicate('search', { query: '???' })).toBeNull();
    expect(guards.checkDuplicate('search', { query: '!!! …' })).not.toBeNull();
  });

  it('survives hostile inputs without crashing: null, undefined, numbers, deep nesting', () => {
    const guards = createToolLoopGuards();
    expect(guards.checkDuplicate('t', null)).toBeNull();
    expect(guards.checkDuplicate('t', null)).not.toBeNull();
    expect(guards.checkDuplicate('t', undefined)).toBeNull();
    expect(guards.checkDuplicate('t', 42)).toBeNull();
    expect(guards.checkDuplicate('t', { a: [{ b: [null, undefined, 1] }] })).toBeNull();
    expect(guards.checkDuplicate('t', { a: [{ b: [null, undefined, 1] }] })).not.toBeNull();
  });

  it('a blocked repeat does not grow the prior-queries list (no message bloat)', () => {
    const guards = createToolLoopGuards();
    guards.checkDuplicate('search', { query: 'klima' });
    guards.checkDuplicate('search', { query: 'klima' });
    guards.checkDuplicate('search', { query: 'klima' });
    const error = guards.checkDuplicate('search', { query: 'klima' });
    expect(error?.match(/klima/g)).toHaveLength(1);
  });

  it('tool names are namespaced: "a" with query "b c" ≠ "a b" with query "c"', () => {
    const guards = createToolLoopGuards();
    expect(guards.checkDuplicate('a', { query: 'b c' })).toBeNull();
    // Key must not be a naive string concat that lets these collide.
    expect(guards.checkDuplicate('a b', { query: 'c' })).toBeNull();
  });

  it('very long queries dedupe without truncation-induced false positives', () => {
    const guards = createToolLoopGuards();
    const long = (suffix: string): string => `${'wort '.repeat(2000)}${suffix}`;
    expect(guards.checkDuplicate('search', { query: long('eins') })).toBeNull();
    expect(guards.checkDuplicate('search', { query: long('zwei') })).toBeNull();
    expect(guards.checkDuplicate('search', { query: long('eins') })).not.toBeNull();
  });
});

describe('createToolLoopGuards — failure caps', () => {
  it('caps failures per tool at MAX_FAILURES_PER_TOOL', () => {
    const guards = createToolLoopGuards();
    expect(guards.checkFailureCap('search')).toBeNull();
    for (let i = 0; i < MAX_FAILURES_PER_TOOL; i++) guards.noteFailure('search');
    expect(guards.checkFailureCap('search')).not.toBeNull();
    expect(guards.checkFailureCap('web')).toBeNull();
  });

  it('caps total failures across all tools at MAX_TOTAL_FAILURES', () => {
    const guards = createToolLoopGuards();
    for (let i = 0; i < MAX_TOTAL_FAILURES; i++) guards.noteFailure(`tool_${i}`);
    expect(guards.checkTotalFailureBudget()).not.toBeNull();
  });

  it('counts empty completions', () => {
    const guards = createToolLoopGuards();
    expect(guards.emptyCompletions).toBe(0);
    expect(guards.noteEmptyCompletion()).toBe(1);
    expect(guards.noteEmptyCompletion()).toBe(2);
    expect(guards.emptyCompletions).toBe(2);
  });

  it('honours custom caps', () => {
    const guards = createToolLoopGuards({ maxFailuresPerTool: 1, maxTotalFailures: 1 });
    guards.noteFailure('x');
    expect(guards.checkFailureCap('x')).not.toBeNull();
    expect(guards.checkTotalFailureBudget()).not.toBeNull();
  });
});

describe('createToolLoopGuards — search budget', () => {
  const SEARCH = new Set(['gruenerator_search', 'web_search']);

  it('blocks search tools after MAX_SEARCH_CALLS executed calls', () => {
    const guards = createToolLoopGuards({ searchToolNames: SEARCH });
    for (let i = 0; i < MAX_SEARCH_CALLS; i++) {
      expect(guards.checkSearchBudget('gruenerator_search')).toBeNull();
      guards.noteCall('gruenerator_search');
    }
    expect(guards.checkSearchBudget('gruenerator_search')).not.toBeNull();
    expect(guards.checkSearchBudget('web_search')).not.toBeNull();
  });

  it('blocks search tools once enough sources accumulated', () => {
    let sources = 0;
    const guards = createToolLoopGuards({
      searchToolNames: SEARCH,
      getSourceCount: () => sources,
    });
    expect(guards.checkSearchBudget('web_search')).toBeNull();
    sources = MAX_SOURCES;
    expect(guards.checkSearchBudget('web_search')).not.toBeNull();
  });

  it('never blocks non-search tools', () => {
    const guards = createToolLoopGuards({
      searchToolNames: SEARCH,
      getSourceCount: () => 100,
    });
    for (let i = 0; i < 10; i++) guards.noteCall('gruenerator_search');
    expect(guards.checkSearchBudget('summarize')).toBeNull();
    expect(guards.checkSearchBudget('bundestag')).toBeNull();
  });

  it('is inert without searchToolNames (sharepic loop default)', () => {
    const guards = createToolLoopGuards();
    for (let i = 0; i < 10; i++) guards.noteCall('apply_sharepic_ops');
    expect(guards.checkSearchBudget('apply_sharepic_ops')).toBeNull();
  });

  it('honours custom budget caps', () => {
    const guards = createToolLoopGuards({ searchToolNames: SEARCH, maxSearchCalls: 1 });
    guards.noteCall('web_search');
    expect(guards.checkSearchBudget('web_search')).not.toBeNull();
  });
});

describe('createToolLoopGuards — internal-first', () => {
  const policy = {
    requiredTool: 'gruenerator_search',
    gatedTools: new Set(['web_search', 'scrape_url']),
    exempt: false,
  };

  it('blocks web/scrape before the internal search ran, unblocks after', () => {
    const guards = createToolLoopGuards({ internalFirst: policy });
    expect(guards.checkInternalFirst('web_search')).not.toBeNull();
    expect(guards.checkInternalFirst('scrape_url')).not.toBeNull();
    guards.noteCall('gruenerator_search');
    expect(guards.checkInternalFirst('web_search')).toBeNull();
    expect(guards.checkInternalFirst('scrape_url')).toBeNull();
  });

  it('never blocks non-gated tools', () => {
    const guards = createToolLoopGuards({ internalFirst: policy });
    expect(guards.checkInternalFirst('gruenerator_search')).toBeNull();
    expect(guards.checkInternalFirst('bundestag')).toBeNull();
  });

  it('exempt bypasses the policy entirely', () => {
    const guards = createToolLoopGuards({ internalFirst: { ...policy, exempt: true } });
    expect(guards.checkInternalFirst('web_search')).toBeNull();
  });

  it('is inert without a policy', () => {
    const guards = createToolLoopGuards();
    expect(guards.checkInternalFirst('web_search')).toBeNull();
  });
});
