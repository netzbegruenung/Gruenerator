import { describe, it, expect } from 'vitest';

import {
  buildCitations,
  deriveCitationTitle,
  renumberAnswerCitations,
  extractDomain,
  resolveCollectionName,
  COLLECTION_LABELS,
  CONTENT_TYPE_LABELS,
} from './citationUtils.js';

import type { SearchResult, Citation } from '../types.js';

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

  it('includes results without a URL (URL is metadata, not a gate)', () => {
    // Private-file sources (Wolke, Connect) have no public URL but must still
    // be citable; URL-less citations carry the empty-string sentinel.
    const results: SearchResult[] = [
      makeResult({ url: undefined, title: 'Wolke-Datei' }),
      makeResult({ url: 'https://gruene.de/test' }),
    ];
    const citations = buildCitations(results);
    expect(citations).toHaveLength(2);
    const urls = citations.map((c) => c.url);
    expect(urls).toContain('https://gruene.de/test');
    expect(urls).toContain('');
  });

  // The cap follows the loop's own gathering budget (loopGuards.MAX_SOURCES = 20),
  // not the historical ceiling of 8. That 8 was applied AFTER the notebook path
  // had widened its slice to 12, so retrieved documents were dropped again on
  // the way to the prompt.
  it('keeps every source up to the gathering budget', () => {
    const results = Array.from({ length: 12 }, (_, i) =>
      makeResult({ url: `https://gruene.de/page${i}`, title: `Page ${i}` })
    );
    expect(buildCitations(results)).toHaveLength(12);
  });

  it('still caps runaway result sets at 20', () => {
    const results = Array.from({ length: 40 }, (_, i) =>
      makeResult({ url: `https://gruene.de/page${i}`, title: `Page ${i}` })
    );
    expect(buildCitations(results)).toHaveLength(20);
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

  it('sets citedText to first 1500 chars for very long content', () => {
    const content = makeLongContent(2000);
    const citations = buildCitations([makeResult({ content })]);
    expect(citations[0].citedText).toHaveLength(1500);
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

  it('groups chunks of the same document and preserves enriched fields', () => {
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
    // The two doc-1 chunks collapse into one citation (grouped by documentId);
    // the representative chunk drives the enriched fields.
    expect(citations).toHaveLength(2);

    expect(citations[0].documentId).toBe('doc-1');
    expect(citations[0].chunkIndex).toBe(0);
    expect(citations[0].similarityScore).toBe(0.95);
    expect(citations[0].collectionId).toBe('deutschland');

    expect(citations[1].documentId).toBeUndefined();
    expect(citations[1].similarityScore).toBeUndefined();
    expect(citations[1].collectionId).toBeUndefined();
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

// ─── renumberAnswerCitations ──────────────────────────────────────────────────

function makeCitation(id: number): Citation {
  return {
    id,
    title: `Quelle ${id}`,
    url: `https://example.org/${id}`,
    snippet: `Auszug ${id}`,
    source: 'web',
  };
}

describe('renumberAnswerCitations', () => {
  // The reported bug: four sources in the prompt, the answer cites 1, 2 and 4,
  // and the reader sees a hole where 3 should be.
  it('closes the gap left by a partially citing answer', () => {
    const { text, citations } = renumberAnswerCitations(
      'Erstens [1]. Zweitens [2]. Drittens [4].',
      [1, 2, 3, 4].map(makeCitation)
    );

    expect(text).toBe('Erstens [1]. Zweitens [2]. Drittens [3].');
    expect(citations.map((c) => c.id)).toEqual([1, 2, 3]);
    // The uncited source is dropped, and [3] now resolves to the old [4].
    expect(citations[2]?.title).toBe('Quelle 4');
  });

  it('numbers by first appearance, not by original order', () => {
    const { text, citations } = renumberAnswerCitations('Zuerst [3], dann [1].', [
      makeCitation(1),
      makeCitation(2),
      makeCitation(3),
    ]);

    expect(text).toBe('Zuerst [1], dann [2].');
    expect(citations.map((c) => c.title)).toEqual(['Quelle 3', 'Quelle 1']);
  });

  // The prompt tells the model to combine supporting sources as `[1, 3]`, and
  // the renderer matches that form. A scanner that only saw `[N]` would treat
  // both ids as uncited, drop them, and leave the stale numbers in the text.
  it('renumbers grouped markers', () => {
    const { text, citations } = renumberAnswerCitations(
      'Beides belegt [2, 4]. Und separat [3].',
      [1, 2, 3, 4].map(makeCitation)
    );

    expect(text).toBe('Beides belegt [1, 2]. Und separat [3].');
    expect(citations.map((c) => c.title)).toEqual(['Quelle 2', 'Quelle 4', 'Quelle 3']);
  });

  it('leaves an already gapless answer untouched', () => {
    const input = 'Eins [1]. Zwei [2].';
    const { text, citations } = renumberAnswerCitations(input, [makeCitation(1), makeCitation(2)]);

    expect(text).toBe(input);
    expect(citations.map((c) => c.id)).toEqual([1, 2]);
  });

  it('keeps the source list when the answer cites nothing', () => {
    const { text, citations } = renumberAnswerCitations('Keine Belege hier.', [
      makeCitation(1),
      makeCitation(2),
    ]);

    expect(text).toBe('Keine Belege hier.');
    expect(citations).toHaveLength(2);
  });

  it('ignores a marker the source list has no entry for', () => {
    const { text, citations } = renumberAnswerCitations('Echt [1], erfunden [9].', [
      makeCitation(1),
    ]);

    expect(text).toBe('Echt [1], erfunden [9].');
    expect(citations.map((c) => c.id)).toEqual([1]);
  });
});
