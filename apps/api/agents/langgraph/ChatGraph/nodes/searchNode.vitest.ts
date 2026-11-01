/**
 * SearchNode Unit Tests — normalizeScore + mergeSearchResults
 *
 * Tests the score normalization and cross-source merge logic that feeds
 * candidates into the rerank pipeline. These are pure functions (aside
 * from vectorConfig reads).
 *
 * Run with: pnpm --filter @gruenerator/api test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../config/vectorConfig.js', () => ({
  vectorConfig: {
    get: vi.fn(() => ({
      inputLimit: 16,
      outputLimit: 8,
      minRelevance: 0.2,
      mmrLambda: 0.7,
      mmrKeepTop: 2,
      mergeOverfetch: 16,
      webScoreCeiling: 0.8,
      dipScoreCeiling: 0.8,
    })),
    // BaseSearchService's constructor calls this at module-load time via the
    // exampleSearchService → DocumentSearchService import chain, so the mock
    // has to satisfy the API even though no test here inspects the return.
    getCacheConfig: vi.fn(() => ({ maxSize: 100, ttl: 60_000 })),
    isVerboseMode: vi.fn(() => false),
  },
}));

vi.mock('../../../../routes/chat/agents/directSearch.js', () => ({}));
vi.mock('../../../../services/search/CrawlingService.js', () => ({}));
vi.mock('../../../../services/search/QueryExpansionService.js', () => ({}));
vi.mock('../../../../utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));
vi.mock('./citationUtils.js', () => ({
  COLLECTION_LABELS: {},
  CONTENT_TYPE_LABELS: {},
  buildCitations: vi.fn(() => []),
  deriveCitationTitle: vi.fn(() => 'Title'),
  extractDomain: vi.fn(() => 'example.com'),
  resolveCollectionName: vi.fn(() => 'collection'),
}));

import { normalizeScore, mergeSearchResults, candidateToSearchResult } from './searchNode.js';
import { createSourceRegistry } from '../../../../routes/chat/services/agenticLoop/sourceRegistry.js';

import type { SearchResult } from '../types.js';

function makeResult(overrides: Partial<SearchResult> & { source: string }): SearchResult {
  return {
    title: 'Test',
    content: 'Test content',
    ...overrides,
  };
}

describe('normalizeScore', () => {
  it('prefers similarityScore for gruenerator docs', () => {
    const r = makeResult({
      source: 'gruenerator:deutschland',
      relevance: 0.7,
      similarityScore: 0.79,
    });
    const score = normalizeScore(r);
    expect(score).toBeCloseTo(0.79 * 1.05, 2);
  });

  it('falls back to relevance when similarityScore is missing', () => {
    const r = makeResult({
      source: 'gruenerator:deutschland',
      relevance: 0.7,
    });
    const score = normalizeScore(r);
    expect(score).toBe(0.7);
  });

  it('caps similarityScore at 1.0', () => {
    const r = makeResult({
      source: 'gruenerator:deutschland',
      similarityScore: 0.99,
    });
    const score = normalizeScore(r);
    expect(score).toBeLessThanOrEqual(1.0);
  });

  it('caps web scores at webScoreCeiling', () => {
    const r = makeResult({
      source: 'web',
      relevance: 1.0,
    });
    const score = normalizeScore(r);
    expect(score).toBe(0.8);
  });

  it('compresses web scores proportionally', () => {
    const r = makeResult({
      source: 'web',
      relevance: 0.5,
    });
    const score = normalizeScore(r);
    expect(score).toBeCloseTo(0.5 * 0.8, 2);
  });

  it('caps DIP scores at dipScoreCeiling', () => {
    // buildBundestagResults gives the person/document header relevance 1 by
    // position, not by similarity. Uncapped it outranks every collection chunk.
    const r = makeResult({ source: 'bundestag', relevance: 1.0 });
    expect(normalizeScore(r)).toBe(0.8);
  });

  it('ranks a strong collection chunk above the top DIP result', () => {
    // The regression this ceiling exists for: without it the DIP header (1.0)
    // beat a 0.79-similarity party document and pushed it out of the rerank
    // input window before the cross-encoder ever saw it.
    const dip = makeResult({ source: 'bundestag', relevance: 1.0 });
    const doc = makeResult({
      source: 'gruenerator:bundestagsfraktion',
      relevance: 0.7,
      similarityScore: 0.79,
    });
    expect(normalizeScore(doc)).toBeGreaterThan(normalizeScore(dip));
  });

  it('keeps DIP ordering intact within its own source', () => {
    const first = makeResult({ source: 'bundestag', relevance: 0.9 });
    const second = makeResult({ source: 'bundestag', relevance: 0.88 });
    expect(normalizeScore(first)).toBeGreaterThan(normalizeScore(second));
  });

  it('preserves examples scores', () => {
    const r = makeResult({
      source: 'examples',
      relevance: 0.8,
    });
    expect(normalizeScore(r)).toBe(0.8);
  });

  it('preserves document-scoped search scores', () => {
    const r = makeResult({
      source: 'document:abc123',
      relevance: 0.65,
    });
    expect(normalizeScore(r)).toBe(0.65);
  });

  it('defaults to 0.5 when no relevance', () => {
    const r = makeResult({ source: 'unknown' });
    expect(normalizeScore(r)).toBe(0.5);
  });
});

describe('mergeSearchResults', () => {
  it('deduplicates by URL', () => {
    const set1: SearchResult[] = [
      makeResult({ source: 'web', url: 'https://a.com', relevance: 0.8 }),
    ];
    const set2: SearchResult[] = [
      makeResult({ source: 'web', url: 'https://a.com', relevance: 0.9 }),
    ];
    const merged = mergeSearchResults(set1, set2);
    expect(merged.length).toBe(1);
  });

  it('keeps results without URLs (no dedup)', () => {
    const set1: SearchResult[] = [
      makeResult({ source: 'examples', relevance: 0.8 }),
      makeResult({ source: 'examples', relevance: 0.7 }),
    ];
    const merged = mergeSearchResults(set1);
    expect(merged.length).toBe(2);
  });

  it('returns up to mergeOverfetch (16)', () => {
    const results: SearchResult[] = Array.from({ length: 20 }, (_, i) =>
      makeResult({ source: 'web', url: `https://example.com/${i}`, relevance: 0.5 })
    );
    const merged = mergeSearchResults(results);
    expect(merged.length).toBe(16);
  });

  it('sorts by normalized score descending', () => {
    const docResult = makeResult({
      source: 'gruenerator:deutschland',
      url: 'https://doc.com',
      similarityScore: 0.85,
      relevance: 0.7,
    });
    const webResult = makeResult({
      source: 'web',
      url: 'https://web.com',
      relevance: 1.0,
    });
    const merged = mergeSearchResults([webResult], [docResult]);
    // Doc: 0.85 * 1.05 = 0.8925; Web: min(0.80, 1.0 * 0.80) = 0.80
    expect(merged[0].url).toBe('https://doc.com');
    expect(merged[1].url).toBe('https://web.com');
  });

  it('handles mixed sources in correct order', () => {
    const doc = makeResult({
      source: 'gruenerator:deutschland',
      url: 'https://doc.com',
      similarityScore: 0.9,
    });
    const web = makeResult({
      source: 'web',
      url: 'https://web.com',
      relevance: 1.0,
    });
    const example = makeResult({
      source: 'examples',
      relevance: 0.8,
    });
    const merged = mergeSearchResults([doc], [web], [example]);
    // Doc: 0.90 * 1.05 = 0.945; Examples: 0.8; Web: 0.80
    expect(merged[0].url).toBe('https://doc.com');
    expect(merged.length).toBe(3);
  });

  it('handles empty input', () => {
    const merged = mergeSearchResults([], []);
    expect(merged.length).toBe(0);
  });
});

describe('candidateToSearchResult — Reihenfolge und Kappe', () => {
  const candidate = (abstract: string | null) =>
    ({
      ref: '21/4371',
      dipId: '1',
      kind: 'drucksache',
      dokumentnummer: '21/4371',
      drucksachetyp: 'Beschlussempfehlung und Bericht',
      titel: 'Beschlussempfehlung zum Artenschutzgesetz',
      datum: '2026-03-04',
      urheber: [],
      pdfUrl: null,
      vorgangId: 'v1',
      vorgangTitel: 'Gesetz zur Stärkung des Artenschutzes',
      abstract,
      aktualisiert: null,
      beratung: null,
      verlauf: {
        schritte: [
          {
            position: '3. Beratung',
            gremium: 'BT',
            datum: '2026-03-05',
            fundstelle: 'Plenarprotokoll 21/62',
            anfangsseite: 7524,
            pdfUrl: null,
            beschluesse: [
              { tenor: 'Annahme in Ausschussfassung', seite: '7524B', abstimmung: null },
            ],
          },
        ],
        verkuendung: { datum: '2026-04-01', fundstelle: 'BGBl. 2026 I Nr. 80', pdfUrl: null },
      },
    }) as never;

  it('stellt Titel, Ref, Vorgang und Verlauf vor das Abstract', () => {
    const { content } = candidateToSearchResult(candidate('Abstract-Text'), 0);
    const at = (needle: string) => content.indexOf(needle);
    expect(at('Beschlussempfehlung zum')).toBe(0);
    expect(at('Ref: 21/4371')).toBeGreaterThan(0);
    expect(at('Ref: 21/4371')).toBeLessThan(at('Gesetz zur Stärkung'));
    expect(at('Gesetz zur Stärkung')).toBeLessThan(at('7524B'));
    expect(at('7524B')).toBeLessThan(at('Abstract-Text'));
  });

  it('lässt ein langes Abstract den Verlauf nicht aus der Schnipselkappe drängen', () => {
    const registry = createSourceRegistry();
    registry.register([candidateToSearchResult(candidate('Lorem ipsum. '.repeat(600)), 0)], {
      snippetChars: 3500,
    });
    const rendered = registry.renderAll();
    expect(rendered).toContain('Plenarprotokoll 21/62');
    expect(rendered).toContain('7524B');
    expect(rendered).toContain('BGBl. 2026 I Nr. 80');
  });
});
