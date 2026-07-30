import { describe, it, expect } from 'vitest';

import {
  fastLookupShape,
  isExplicitDeepRequest,
  isKeywordShapedQuery,
  resolveSearchPlan,
  resolveSearchTier,
  resolveTier,
  SEARCH_TIERS,
} from './searchDepth.js';

/**
 * The tier ladder has now been wrong in both directions, and these tests exist to
 * pin the second correction.
 *
 * v1 had a cheap door and an expensive door: `web` → depth=standard, `research` →
 * depth=deep with Linkup writing the answer, reachable by the word
 * "recherchiere" alone. v2 added a middle rung but put it on depth=deep and
 * handed it out for `complexity === 'complex'` — a value `detectComplexity`
 * returns for any "vergleich"/"ausführlich"/"gründlich" in the text. So the most
 * expensive engine setting became the default for ordinary comparison questions.
 *
 * v3 separates tier from engine depth: breadth is bought on `standard` via
 * Linkup's own adjacent-keyword fan-out, and only an explicit ask reaches `deep`.
 */
describe('resolveSearchTier', () => {
  it('keeps an ordinary web question at the cheap tier', () => {
    expect(resolveSearchTier({ intent: 'web' })).toBe('standard');
  });

  it('gives a research intent the middle tier — which no longer costs deep', () => {
    expect(resolveSearchTier({ intent: 'research' })).toBe('gruendlich');
    expect(resolveTier('gruendlich').depth).toBe('standard');
  });

  /**
   * The v2 regression, pinned twice over: there is no `complexity` parameter any
   * more, so no phrasing in the user's text can buy engine depth by itself.
   */
  it('cannot be upgraded by anything but an explicit ask', () => {
    expect(resolveSearchTier({ intent: 'web' })).toBe('standard');
    expect(resolveSearchTier({ intent: 'research' })).toBe('gruendlich');
    expect(resolveSearchTier({ intent: 'research', explicitDeep: true })).toBe('gruendlich');
  });

  it('honours the top tier only when the user explicitly asked for it', () => {
    expect(
      resolveSearchTier({ intent: 'web', requestedTier: 'tiefenrecherche', explicitDeep: true })
    ).toBe('tiefenrecherche');
  });

  /**
   * The model naming a tier is a REQUEST. Left unclamped, the deep engine is one
   * hallucinated tool argument away on every single turn — a tool description
   * saying "nutze sie sparsam" is documentation, not enforcement.
   */
  it('clamps a model-requested top tier when the user never asked for it', () => {
    expect(resolveSearchTier({ intent: 'web', requestedTier: 'tiefenrecherche' })).toBe(
      'gruendlich'
    );
    expect(
      resolveSearchTier({ intent: 'web', requestedTier: 'tiefenrecherche', explicitDeep: false })
    ).toBe('gruendlich');
  });

  /**
   * The same rule downward. The tool description named "wer jemand war" as the
   * textbook `gruendlich` case, and the planner model still asked for `standard`
   * on exactly that question and answered from five snippets — so the normal
   * case is enforced, not advertised. Free to enforce: both tiers are one paid
   * call at the same engine depth.
   */
  it('raises a model-requested standard back to the normal case', () => {
    expect(resolveSearchTier({ intent: 'direct', requestedTier: 'standard' })).toBe('gruendlich');
    expect(
      resolveSearchTier({ intent: 'web', requestedTier: 'standard', explicitDeep: true })
    ).toBe('gruendlich');
  });

  /**
   * The clamp reaches the MODEL's choice only. The classifier path passes no
   * `requestedTier`, so its intent-derived `standard` — the narrow lookups, and
   * the progress copy that keys on that tier — stays as it was.
   */
  it('leaves the intent-derived standard alone', () => {
    expect(resolveSearchTier({ intent: 'web' })).toBe('standard');
    expect(resolveSearchTier({ intent: 'direct', requestedTier: 'gruendlich' })).toBe('gruendlich');
  });
});

describe('resolveTier', () => {
  it('spends the expensive engine depth ONLY on the top tier', () => {
    expect(resolveTier('standard').depth).toBe('standard');
    expect(resolveTier('gruendlich').depth).toBe('standard');
    expect(resolveTier('tiefenrecherche').depth).toBe('deep');
  });

  it('buys the middle tier its breadth from the engine, not from a deeper mode', () => {
    expect(resolveTier('gruendlich').adjacentSearches).toBe(true);
    expect(resolveTier('gruendlich').maxResults).toBeGreaterThan(
      resolveTier('standard').maxResults
    );
  });

  it('grows monotonically, so a higher tier never retrieves less', () => {
    const counts = SEARCH_TIERS.map((t) => resolveTier(t).maxResults);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
  });

  it('defaults to the cheap tier when none was chosen', () => {
    expect(resolveTier(undefined)).toEqual(resolveTier('standard'));
  });

  it('promises a longer wait only where there is one', () => {
    expect(resolveTier('standard').progress).not.toMatch(/\d+s/);
    expect(resolveTier('tiefenrecherche').progress).toMatch(/\d+/);
  });
});

describe('fastLookupShape', () => {
  it('accepts a bare lookup', () => {
    expect(fastLookupShape('Tempolimit Autobahn Studien')).toBe('keywords');
    expect(fastLookupShape('Windkraft Ausbau 2025')).toBe('keywords');
  });

  /**
   * The case the first version got wrong: a short question asking for ONE value is
   * exactly what the sub-second engine is for. Its stopwords ("wann", "ist") are
   * noise a keyword index absorbs — the content words still decide the hit.
   */
  it('accepts a question that asks for a single value', () => {
    expect(fastLookupShape('wann ist Marilyn Monroe geboren')).toBe('single-fact');
    expect(fastLookupShape('Wer ist Bundeskanzler?')).toBe('single-fact');
    expect(fastLookupShape('wie viele Einwohner hat Kassel')).toBe('single-fact');
    expect(fastLookupShape('wie hoch ist der Mindestlohn')).toBe('single-fact');
  });

  /**
   * Explanatory questions want a synthesis across sources — the one thing this
   * depth cannot do. Excluded even though they are short.
   */
  it('rejects explanatory questions', () => {
    expect(fastLookupShape('warum steigt der Strompreis')).toBe(null);
    expect(fastLookupShape('wie funktioniert eine Wärmepumpe')).toBe(null);
    expect(fastLookupShape('was bedeutet Klimaneutralität')).toBe(null);
    expect(fastLookupShape('Was ist das Tempolimit?')).toBe(null);
  });

  it('rejects instructions and multi-part queries', () => {
    // `fast` has no LLM: every word below would become a search TERM.
    expect(fastLookupShape('Vergleiche Windkraft und Solar')).toBe(null);
    expect(fastLookupShape('recherchiere Tempolimit')).toBe(null);
    expect(fastLookupShape('Tempolimit und Klimaziele')).toBe(null);
  });

  it('rejects long queries and URLs', () => {
    expect(fastLookupShape('a b c d e f g')).toBe(null);
    expect(fastLookupShape('wann genau wurde diese eine bestimmte Person eigentlich geboren')).toBe(
      null
    );
    // `fast` cannot scrape at all — a URL belongs to the agentic depths.
    expect(fastLookupShape('https://example.org/x')).toBe(null);
  });

  it('rejects the empty query', () => {
    expect(fastLookupShape('')).toBe(null);
    expect(fastLookupShape('   ')).toBe(null);
    expect(isKeywordShapedQuery('')).toBe(false);
  });
});

describe('resolveSearchPlan', () => {
  it('takes the sub-second engine for a keyword lookup', () => {
    const plan = resolveSearchPlan({ tier: 'standard', query: 'Tempolimit Studien' });
    expect(plan.depth).toBe('fast');
    expect(plan.fastReason).toBe('keywords');
  });

  it('takes the sub-second engine for a single-fact question', () => {
    const plan = resolveSearchPlan({ tier: 'standard', query: 'wann ist Marilyn Monroe geboren' });
    expect(plan.depth).toBe('fast');
    expect(plan.fastReason).toBe('single-fact');
  });

  it('stays on the interpreting engine for an explanatory question', () => {
    const plan = resolveSearchPlan({ tier: 'standard', query: 'warum gilt hier ein Tempolimit?' });
    expect(plan.depth).toBe('standard');
    expect(plan.fastReason).toBe(null);
  });

  /**
   * The combination that must be unrepresentable: the adjacent-keyword request is
   * PROSE appended to the query, and `fast` reads prose as search terms. Returning
   * depth and instruction from one function is what prevents it.
   */
  it('never combines the keyword-only engine with an instruction', () => {
    for (const tier of SEARCH_TIERS) {
      const plan = resolveSearchPlan({ tier, query: 'Tempolimit Studien' });
      expect(plan.depth === 'fast' && plan.adjacentSearches).toBe(false);
    }
  });

  it('keeps the middle tier on standard even for a keyword query, because it fans out', () => {
    const plan = resolveSearchPlan({ tier: 'gruendlich', query: 'Tempolimit Studien' });
    expect(plan.depth).toBe('standard');
    expect(plan.adjacentSearches).toBe(true);
  });

  it('lets a caller override the result count without touching the depth', () => {
    const plan = resolveSearchPlan({ tier: 'standard', query: 'Was gilt hier?', maxResults: 3 });
    expect(plan.maxResults).toBe(3);
    expect(plan.depth).toBe('standard');
  });

  it('defaults to the cheap tier and never guesses fast without a query', () => {
    expect(resolveSearchPlan({}).tier).toBe('standard');
    expect(resolveSearchPlan({}).depth).toBe('standard');
  });
});

describe('isExplicitDeepRequest', () => {
  it('needs a research verb AND a thoroughness marker', () => {
    expect(isExplicitDeepRequest('recherchiere das gründlich')).toBe(true);
    expect(isExplicitDeepRequest('untersuche das ausführlich')).toBe(true);
  });

  it('accepts the compound word on its own', () => {
    expect(isExplicitDeepRequest('mach mir eine Tiefenrecherche zum Thema')).toBe(true);
    expect(isExplicitDeepRequest('ich brauche ein Dossier')).toBe(true);
  });

  /**
   * The bar that keeps the deep engine from becoming the default again: an
   * ordinary research turn is not a request for the expensive mode, and neither is
   * the word "ausführlich" about the ANSWER's length.
   */
  it('leaves an ordinary research ask alone', () => {
    expect(isExplicitDeepRequest('recherchiere das mal')).toBe(false);
    expect(isExplicitDeepRequest('vergleiche die Positionen ausführlich')).toBe(false);
    expect(isExplicitDeepRequest('was ist das Tempolimit')).toBe(false);
  });

  it('handles missing input', () => {
    expect(isExplicitDeepRequest(null)).toBe(false);
    expect(isExplicitDeepRequest(undefined)).toBe(false);
    expect(isExplicitDeepRequest('')).toBe(false);
  });
});
