import { describe, it, expect } from 'vitest';

import {
  buildCitations,
  deriveCitationTitle,
  extractDomain,
  resolveCollectionName,
  COLLECTION_LABELS,
  CONTENT_TYPE_LABELS,
} from './citationUtils.js';
import type { SearchResult } from '../types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    source: 'gruenerator:deutschland',
    title: 'Grundsatzprogramm',
    content: 'Die Grünen fordern ein nachhaltiges Wirtschaftssystem.',
    url: 'https://gruene.de/grundsatzprogramm',
    relevance: 0.85,
    ...overrides,
  };
}

function makeLongContent(length: number): string {
  return 'a'.repeat(length);
}

// ─── buildCitations: basic behavior ──────────────────────────────────────────

describe('buildCitations', () => {
  it('returns empty array for empty input', () => {
    expect(buildCitations([])).toEqual([]);
  });

  it('filters out results without a URL', () => {
    const results: SearchResult[] = [
      makeResult({ url: undefined }),
      makeResult({ url: 'https://gruene.de/test' }),
    ];
    const citations = buildCitations(results);
    expect(citations).toHaveLength(1);
    expect(citations[0].url).toBe('https://gruene.de/test');
  });

  it('limits to 8 citations max', () => {
    const results = Array.from({ length: 12 }, (_, i) =>
      makeResult({ url: `https://gruene.de/page${i}`, title: `Page ${i}` })
    );
    const citations = buildCitations(results);
    expect(citations).toHaveLength(8);
  });

  it('assigns sequential IDs starting at 1', () => {
    const results = [
      makeResult({ url: 'https://a.de' }),
      makeResult({ url: 'https://b.de' }),
      makeResult({ url: 'https://c.de' }),
    ];
    const citations = buildCitations(results);
    expect(citations.map((c) => c.id)).toEqual([1, 2, 3]);
  });

  // ─── snippet / citedText ──────────────────────────────────────────────────

  it('creates snippet from first 200 chars of content', () => {
    const content = makeLongContent(300);
    const citations = buildCitations([makeResult({ content })]);
    expect(citations[0].snippet).toHaveLength(200);
  });

  it('sets citedText when content exceeds 200 chars', () => {
    const content = makeLongContent(300);
    const citations = buildCitations([makeResult({ content })]);
    expect(citations[0].citedText).toBeDefined();
    expect(citations[0].citedText).toHaveLength(300);
  });

  it('sets citedText to first 500 chars for very long content', () => {
    const content = makeLongContent(800);
    const citations = buildCitations([makeResult({ content })]);
    expect(citations[0].citedText).toHaveLength(500);
  });

  it('does not set citedText for short content', () => {
    const citations = buildCitations([makeResult({ content: 'Short text' })]);
    expect(citations[0].citedText).toBeUndefined();
  });

  // ─── source / collectionName / domain ─────────────────────────────────────

  it('preserves source from SearchResult', () => {
    const citations = buildCitations([makeResult({ source: 'gruenerator:kommunalwiki' })]);
    expect(citations[0].source).toBe('gruenerator:kommunalwiki');
  });

  it('resolves collectionName from gruenerator: prefix', () => {
    const citations = buildCitations([makeResult({ source: 'gruenerator:deutschland' })]);
    expect(citations[0].collectionName).toBe('Grundsatzprogramm');
  });

  it('resolves collectionName for web source', () => {
    const citations = buildCitations([makeResult({ source: 'web' })]);
    expect(citations[0].collectionName).toBe('Web');
  });

  it('extracts domain from URL', () => {
    const citations = buildCitations([makeResult({ url: 'https://www.gruene.de/some/path' })]);
    expect(citations[0].domain).toBe('www.gruene.de');
  });

  it('sets domain to undefined for invalid URL', () => {
    const citations = buildCitations([makeResult({ url: 'not-a-url' })]);
    expect(citations[0].domain).toBeUndefined();
  });

  // ─── relevance / contentType ──────────────────────────────────────────────

  it('passes through relevance score', () => {
    const citations = buildCitations([makeResult({ relevance: 0.92 })]);
    expect(citations[0].relevance).toBe(0.92);
  });

  it('maps known content types to German labels', () => {
    const citations = buildCitations([makeResult({ contentType: 'presse' })]);
    expect(citations[0].contentType).toBe('Pressemitteilung');
  });

  it('maps content types case-insensitively', () => {
    const citations = buildCitations([makeResult({ contentType: 'Beschluss' })]);
    expect(citations[0].contentType).toBe('Beschluss');
  });

  it('passes through unknown content types unchanged', () => {
    const citations = buildCitations([makeResult({ contentType: 'interview' })]);
    expect(citations[0].contentType).toBe('interview');
  });

  it('sets contentType to undefined when absent', () => {
    const citations = buildCitations([makeResult({ contentType: undefined })]);
    expect(citations[0].contentType).toBeUndefined();
  });
});

// ─── buildCitations: enriched Qdrant fields ─────────────────────────────────

describe('buildCitations — enriched fields', () => {
  it('threads documentId from SearchResult to Citation', () => {
    const citations = buildCitations([makeResult({ documentId: 'doc-abc-123' })]);
    expect(citations[0].documentId).toBe('doc-abc-123');
  });

  it('threads chunkIndex from SearchResult to Citation', () => {
    const citations = buildCitations([makeResult({ chunkIndex: 3 })]);
    expect(citations[0].chunkIndex).toBe(3);
  });

  it('threads similarityScore from SearchResult to Citation', () => {
    const citations = buildCitations([makeResult({ similarityScore: 0.87 })]);
    expect(citations[0].similarityScore).toBe(0.87);
  });

  it('threads collectionId from SearchResult to Citation', () => {
    const citations = buildCitations([makeResult({ collectionId: 'deutschland' })]);
    expect(citations[0].collectionId).toBe('deutschland');
  });

  it('leaves enriched fields undefined when not present', () => {
    const citations = buildCitations([makeResult()]);
    expect(citations[0].documentId).toBeUndefined();
    expect(citations[0].chunkIndex).toBeUndefined();
    expect(citations[0].similarityScore).toBeUndefined();
    expect(citations[0].collectionId).toBeUndefined();
  });

  it('handles chunkIndex of 0 correctly', () => {
    const citations = buildCitations([makeResult({ chunkIndex: 0 })]);
    expect(citations[0].chunkIndex).toBe(0);
  });

  it('handles similarityScore of 0 correctly', () => {
    const citations = buildCitations([makeResult({ similarityScore: 0 })]);
    expect(citations[0].similarityScore).toBe(0);
  });

  it('preserves all enriched fields across mixed results', () => {
    const results = [
      makeResult({
        url: 'https://gruene.de/a',
        documentId: 'doc-1',
        chunkIndex: 0,
        similarityScore: 0.95,
        collectionId: 'deutschland',
      }),
      makeResult({
        url: 'https://gruene.de/b',
        documentId: 'doc-1',
        chunkIndex: 2,
        similarityScore: 0.72,
        collectionId: 'deutschland',
      }),
      makeResult({
        url: 'https://taz.de/article',
        source: 'web',
        documentId: undefined,
        similarityScore: undefined,
        collectionId: undefined,
      }),
    ];
    const citations = buildCitations(results);
    expect(citations).toHaveLength(3);

    expect(citations[0].documentId).toBe('doc-1');
    expect(citations[0].chunkIndex).toBe(0);
    expect(citations[0].similarityScore).toBe(0.95);
    expect(citations[0].collectionId).toBe('deutschland');

    expect(citations[1].documentId).toBe('doc-1');
    expect(citations[1].chunkIndex).toBe(2);
    expect(citations[1].similarityScore).toBe(0.72);

    expect(citations[2].documentId).toBeUndefined();
    expect(citations[2].similarityScore).toBeUndefined();
    expect(citations[2].collectionId).toBeUndefined();
  });
});

// ─── deriveCitationTitle ────────────────────────────────────────────────────

describe('deriveCitationTitle', () => {
  it('returns source when it is a real title', () => {
    expect(deriveCitationTitle('Klimapolitik der Grünen', undefined, 'deutschland')).toBe(
      'Klimapolitik der Grünen'
    );
  });

  it('falls back to URL-derived title for generic sources', () => {
    expect(
      deriveCitationTitle('Unbekannte Quelle', 'https://gruene.de/grundsatzprogramm', 'deutschland')
    ).toBe('Grundsatzprogramm');
  });

  it('falls back to URL-derived title when source matches collection key', () => {
    expect(
      deriveCitationTitle('deutschland', 'https://gruene.de/klima-schutz', 'deutschland')
    ).toBe('Klima schutz');
  });

  it('falls back to collection label when URL is unusable', () => {
    expect(deriveCitationTitle('Untitled', undefined, 'deutschland')).toBe('Grundsatzprogramm');
  });

  it('falls back to raw collection key for unknown collections', () => {
    expect(deriveCitationTitle('Unknown', undefined, 'custom-collection')).toBe(
      'custom-collection'
    );
  });

  it('strips file extensions from URL path', () => {
    expect(
      deriveCitationTitle(undefined, 'https://gruene.de/docs/klimaschutz.pdf', 'deutschland')
    ).toBe('Klimaschutz');
  });

  it('skips numeric-only path segments', () => {
    expect(
      deriveCitationTitle(undefined, 'https://gruene.de/2024/klimaschutz', 'deutschland')
    ).toBe('Klimaschutz');
  });
});

// ─── extractDomain ──────────────────────────────────────────────────────────

describe('extractDomain', () => {
  it('extracts hostname from URL', () => {
    expect(extractDomain('https://www.gruene.de/path')).toBe('www.gruene.de');
  });

  it('returns undefined for undefined input', () => {
    expect(extractDomain(undefined)).toBeUndefined();
  });

  it('returns undefined for invalid URL', () => {
    expect(extractDomain('not-a-url')).toBeUndefined();
  });
});

// ─── resolveCollectionName ──────────────────────────────────────────────────

describe('resolveCollectionName', () => {
  it('resolves prefixed source', () => {
    expect(resolveCollectionName('gruenerator:deutschland')).toBe('Grundsatzprogramm');
  });

  it('resolves plain source', () => {
    expect(resolveCollectionName('web')).toBe('Web');
  });

  it('returns undefined for unknown source', () => {
    expect(resolveCollectionName('gruenerator:unknown')).toBeUndefined();
  });
});

// ─── COLLECTION_LABELS ──────────────────────────────────────────────────────

describe('COLLECTION_LABELS', () => {
  it('has labels for all default German collections', () => {
    expect(COLLECTION_LABELS.deutschland).toBe('Grundsatzprogramm');
    expect(COLLECTION_LABELS.bundestagsfraktion).toBe('Bundestagsfraktion');
    expect(COLLECTION_LABELS['gruene-de']).toBe('gruene.de');
    expect(COLLECTION_LABELS.kommunalwiki).toBe('Kommunalwiki');
  });

  it('has labels for Austrian collections', () => {
    expect(COLLECTION_LABELS.oesterreich).toBe('Österreich');
  });

  it('has labels for Landesverband collections', () => {
    expect(COLLECTION_LABELS.hamburg).toBe('Hamburg');
    expect(COLLECTION_LABELS['schleswig-holstein']).toBe('Schleswig-Holstein');
    expect(COLLECTION_LABELS.thueringen).toBe('Thüringen');
    expect(COLLECTION_LABELS.bayern).toBe('Bayern');
  });

  it('has labels for web and research', () => {
    expect(COLLECTION_LABELS.web).toBe('Web');
    expect(COLLECTION_LABELS.research).toBe('Recherche');
  });
});

// ─── CONTENT_TYPE_LABELS ────────────────────────────────────────────────────

describe('CONTENT_TYPE_LABELS', () => {
  it('maps presse to Pressemitteilung', () => {
    expect(CONTENT_TYPE_LABELS.presse).toBe('Pressemitteilung');
  });

  it('maps beschluss to Beschluss', () => {
    expect(CONTENT_TYPE_LABELS.beschluss).toBe('Beschluss');
  });

  it('maps wahlprogramm to Wahlprogramm', () => {
    expect(CONTENT_TYPE_LABELS.wahlprogramm).toBe('Wahlprogramm');
  });
});
