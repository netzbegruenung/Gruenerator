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

describe('createToolLoopGuards — near-duplicate (Jaccard)', () => {
  it('blocks a re-phrasing that shares ≥0.6 tokens with a prior same-tool search', () => {
    const guards = createToolLoopGuards();
    expect(
      guards.checkDuplicate('gruenerator_search', { query: 'Atomkraft Position Grüne' })
    ).toBeNull();
    // "Position Atomkraft" ⊂ prior → overlap 2/3 = 0.67 → blocked.
    expect(
      guards.checkDuplicate('gruenerator_search', { query: 'Position Atomkraft' })
    ).not.toBeNull();
    // "Atomkraft Grüne" vs prior → 2/3 = 0.67 → blocked.
    expect(
      guards.checkDuplicate('gruenerator_search', { query: 'Atomkraft Grüne' })
    ).not.toBeNull();
  });

  it('skipNearDuplicate (MCP connectors) allows a "too similar" retry but still blocks exact repeats', () => {
    const guards = createToolLoopGuards();
    // A connector call, then a corrective retry that shares ≥0.6 tokens (would
    // be near-dup-blocked for a search tool) — allowed for connectors.
    expect(
      guards.checkDuplicate(
        'mb2__search_appointments',
        { subject: 'Protokoll Juli' },
        { skipNearDuplicate: true }
      )
    ).toBeNull();
    expect(
      guards.checkDuplicate(
        'mb2__search_appointments',
        { subject: 'Protokoll' },
        { skipNearDuplicate: true }
      )
    ).toBeNull();
    // Exact-normalized repeat is STILL blocked (prevents identical failure loops).
    expect(
      guards.checkDuplicate(
        'mb2__search_appointments',
        { subject: 'Protokoll' },
        { skipNearDuplicate: true }
      )
    ).not.toBeNull();
  });

  it('the Q5 regression: 4 Atomkraft variants collapse, other topics stay free', () => {
    const guards = createToolLoopGuards({
      searchToolNames: new Set(['gruenerator_search']),
    });
    const search = (q: string): string | null =>
      guards.checkSearchBudget('gruenerator_search') ??
      guards.checkDuplicate('gruenerator_search', { query: q }) ??
      (guards.noteCall('gruenerator_search'), null);

    expect(search('Atomkraft Position Grüne')).toBeNull(); // 1st Atomkraft — runs
    expect(search('Atomkraft Grüne')).not.toBeNull(); // near-dup — blocked
    expect(search('Position Atomkraft')).not.toBeNull(); // near-dup — blocked
    // The other three topics are NOT similar → all allowed (were starved before).
    expect(search('Tempolimit 130 Autobahn')).toBeNull();
    expect(search('Vermögensteuer Grüne')).toBeNull();
    expect(search('Cannabis Legalisierung Grüne')).toBeNull();
  });

  it('a genuinely different topic on the same tool is allowed', () => {
    const guards = createToolLoopGuards();
    expect(guards.checkDuplicate('gruenerator_search', { query: 'Atomkraft Position' })).toBeNull();
    expect(
      guards.checkDuplicate('gruenerator_search', { query: 'Tempolimit Autobahn' })
    ).toBeNull();
  });

  it('near-dup does NOT fire in consecutive scope (sharepic edit loop unaffected)', () => {
    const guards = createToolLoopGuards({ duplicateScope: 'consecutive' });
    expect(guards.checkDuplicate('apply', { text: 'Zeile eins kürzen' })).toBeNull();
    // Overlapping but not identical — must be allowed for edit ops.
    expect(guards.checkDuplicate('apply', { text: 'Zeile eins fetten' })).toBeNull();
  });

  it('a single-token synonym slips through (documented Jaccard limit)', () => {
    const guards = createToolLoopGuards();
    expect(guards.checkDuplicate('gruenerator_search', { query: 'Atomkraft Grüne' })).toBeNull();
    // "Atomenergie" shares no tokens with "Atomkraft" → lexical dedup can't catch it.
    expect(guards.checkDuplicate('gruenerator_search', { query: 'Atomenergie' })).toBeNull();
  });

  it('threshold is tunable; a non-subset near-dup is allowed at 1.0, exact repeat blocked', () => {
    const guards = createToolLoopGuards({ nearDuplicateJaccard: 1 });
    expect(guards.checkDuplicate('s', { query: 'Atomkraft Position Grüne' })).toBeNull();
    // Shares 2 tokens but neither set contains the other; Jaccard 0.5 < 1.0 → allowed.
    expect(guards.checkDuplicate('s', { query: 'Position Atomkraft Tempolimit' })).toBeNull();
    // Exact token-set repeat (reordered) → always blocked.
    expect(guards.checkDuplicate('s', { query: 'grüne position atomkraft' })).not.toBeNull();
  });

  it('subset-containment blocks a narrowed/widened re-search regardless of the threshold', () => {
    // The Balkonkraftwerke over-search: a later query that is a pure subset of an
    // earlier one (or vice versa) is a redundant re-search Jaccard alone missed.
    const guards = createToolLoopGuards({ nearDuplicateJaccard: 1 });
    expect(
      guards.checkDuplicate('web_search', {
        query: 'Anzahl Balkonkraftwerke Deutschland 2023 2024',
      })
    ).toBeNull();
    // ⊂ the prior set (all 4 tokens contained) → blocked even at threshold 1.0.
    expect(
      guards.checkDuplicate('web_search', { query: 'Balkonkraftwerke 2024 Anzahl Deutschland' })
    ).not.toBeNull();
  });

  it('subset-containment does NOT collapse distinct single-topic queries (≥2 floor)', () => {
    const guards = createToolLoopGuards({ nearDuplicateJaccard: 0.6 });
    expect(guards.checkDuplicate('s', { query: 'Position Atomkraft Grüne' })).toBeNull();
    // Shares only "position"/"grüne" pattern but a different topic; not a subset.
    expect(guards.checkDuplicate('s', { query: 'Position Tempolimit Grüne' })).toBeNull();
    // A single shared token is below the ≥2 subset floor → still allowed.
    expect(guards.checkDuplicate('s', { query: 'Vermögensteuer' })).toBeNull();
  });
});

describe('createToolLoopGuards — budget rework (multi-topic)', () => {
  const SEARCH = new Set(['gruenerator_search', 'web_search']);

  it('two rich searches (10 sources) no longer starve the budget (was the Q5 bug)', () => {
    let sources = 0;
    const guards = createToolLoopGuards({
      searchToolNames: SEARCH,
      getSourceCount: () => sources,
    });
    guards.noteCall('gruenerator_search');
    sources = 5;
    guards.noteCall('gruenerator_search');
    sources = 10; // two topics, 10 sources — under the new 20 ceiling
    // A third topic is still allowed (old maxSources=6 would have blocked here).
    expect(guards.checkSearchBudget('gruenerator_search')).toBeNull();
  });

  it('allows up to 6 distinct searches, then caps', () => {
    const guards = createToolLoopGuards({ searchToolNames: SEARCH });
    for (let i = 0; i < 6; i++) {
      expect(guards.checkSearchBudget('gruenerator_search')).toBeNull();
      guards.noteCall('gruenerator_search');
    }
    expect(guards.checkSearchBudget('gruenerator_search')).not.toBeNull();
  });

  it('the source ceiling still fires as a context-safety backstop (20)', () => {
    let sources = 25;
    const guards = createToolLoopGuards({
      searchToolNames: SEARCH,
      getSourceCount: () => sources,
    });
    expect(guards.checkSearchBudget('web_search')).not.toBeNull();
    sources = 19;
    expect(guards.checkSearchBudget('web_search')).toBeNull();
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

  it('blocks web/scrape before the internal search ran, unblocks when internal COMPLETED but came up SHORT', () => {
    let sources = 0;
    const guards = createToolLoopGuards({ internalFirst: policy, getSourceCount: () => sources });
    expect(guards.checkInternalFirst('web_search')).not.toBeNull();
    expect(guards.checkInternalFirst('scrape_url')).not.toBeNull();
    guards.noteCall('gruenerator_search');
    guards.noteCompletion('gruenerator_search');
    sources = 1; // internal completed but yielded little → web is allowed as a fallback
    expect(guards.checkInternalFirst('web_search')).toBeNull();
    expect(guards.checkInternalFirst('scrape_url')).toBeNull();
  });

  it('holds web while the internal search is IN FLIGHT (same-step parallel race)', () => {
    const guards = createToolLoopGuards({ internalFirst: policy, getSourceCount: () => 0 });
    // Internal call started (noteCall) but not yet completed — the register-lag
    // window where web_search used to slip through. Must be blocked.
    guards.noteCall('gruenerator_search');
    expect(guards.checkInternalFirst('web_search')).not.toBeNull();
    // Once internal completes with 0 sources, web is allowed (empty → fall back).
    guards.noteCompletion('gruenerator_search');
    expect(guards.checkInternalFirst('web_search')).toBeNull();
  });

  it('prefer-internal: once internal yields enough sources, web/scrape are refused', () => {
    let sources = 0;
    const guards = createToolLoopGuards({ internalFirst: policy, getSourceCount: () => sources });
    guards.noteCall('gruenerator_search');
    guards.noteCompletion('gruenerator_search');
    sources = 5; // enough internal evidence → do not web-search on top
    expect(guards.checkInternalFirst('web_search')).not.toBeNull();
    // Also blocks a model-invented scrape URL (Q2 gruene.de/positionen/atomkraft 404).
    expect(guards.checkInternalFirst('scrape_url')).not.toBeNull();
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
