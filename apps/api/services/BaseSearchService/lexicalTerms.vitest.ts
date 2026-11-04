import { describe, it, expect } from 'vitest';

import { BaseSearchService } from './BaseSearchService.js';

import type { TransformedChunk } from './types.js';

/**
 * Fachbegriffe einer langen Frage (#5341). Ein Fragesatz steht in keinem
 * Abschnitt wörtlich, also war `has_term` für lange Fragen immer falsch, und die
 * Regel „ein Treffer-Abschnitt steht in den Top-Chunks seines Dokuments" griff
 * nie: ein Abschnitt, der den Gegenstand der Frage nur in einem Nebensatz nennt,
 * fiel aus den zehn Stellen seines Dokuments.
 */
const QUESTION = 'Welche Haltungen zur Wärmepumpe gibt es, und wie hängen sie zusammen?';

const chunk = (docId: string, index: number, text: string, similarity: number): TransformedChunk =>
  ({
    id: `${docId}-c${index}`,
    document_id: docId,
    documents: { id: docId, title: 'Beschluss', filename: 'beschluss.pdf' },
    chunk_index: index,
    chunk_text: text,
    similarity,
  }) as unknown as TransformedChunk;

/** Zwölf allgemeine Abschnitte, der eine mit dem Begriff am schwächsten. */
const pool = () => [
  ...Array.from({ length: 12 }, (_, i) =>
    chunk('doc', i, `Allgemeiner Abschnitt ${i} über politische Haltungen.`, 0.8 - i / 100)
  ),
  chunk('doc', 12, 'Erreicht haben wir viel, auch beim Förderprogramm für die Wärmepumpe.', 0.6),
];

const svc = () => new BaseSearchService({ serviceName: 'Test' });

describe('groupAndRankHybridResults — lexical terms', () => {
  it('leaves the term chunk out of the top chunks without terms', async () => {
    const [doc] = await svc().groupAndRankHybridResults(pool(), 10, QUESTION, {});
    expect(doc?.top_chunks.map((c) => c.chunk_index)).not.toContain(12);
  });

  it('puts the chunk naming a term first in its document', async () => {
    const [doc] = await svc().groupAndRankHybridResults(pool(), 10, QUESTION, {
      lexicalTerms: ['Wärmepumpe'],
    });
    expect(doc?.top_chunks[0]?.chunk_index).toBe(12);
    expect(doc?.top_chunks).toHaveLength(10);
  });

  it('centres the preview on the term, not on the question', async () => {
    const [doc] = await svc().groupAndRankHybridResults(pool(), 10, QUESTION, {
      lexicalTerms: ['Wärmepumpe'],
    });
    expect(doc?.top_chunks[0]?.preview).toContain('Wärmepumpe');
  });

  it('gives a term hit no score boost and no has_term flag', async () => {
    const [plain] = await svc().groupAndRankHybridResults(pool(), 10, QUESTION, {});
    const [withTerm] = await svc().groupAndRankHybridResults(pool(), 10, QUESTION, {
      lexicalTerms: ['Wärmepumpe'],
    });
    expect(withTerm?.top_chunks[0]?.has_term).toBe(false);
    expect(withTerm?.max_similarity).toBe(plain?.max_similarity);
  });

  it('ignores a term that stands in more than a tenth of the pool', async () => {
    const chunks = pool().map((c, i) =>
      i < 3 ? ({ ...c, chunk_text: `${String(c.chunk_text)} Wärmepumpe.` } as TransformedChunk) : c
    );
    // 4 of 13 chunks carry the term: a generic word, not a signal.
    const [doc] = await svc().groupAndRankHybridResults(chunks, 10, QUESTION, {
      lexicalTerms: ['Wärmepumpe'],
    });
    expect(doc?.top_chunks[0]?.chunk_index).toBe(0);
  });
});

describe('generateCacheKey — lexical terms', () => {
  it('keeps the same question with and without terms apart', () => {
    const base = {
      query: QUESTION,
      userId: 'u',
      filters: {},
      options: { limit: 10, threshold: 0.35, useCache: true },
    };
    const plain = svc().generateCacheKey(base);
    const withTerms = svc().generateCacheKey({
      ...base,
      options: { ...base.options, lexicalTerms: ['Wärmepumpe'] },
    });
    expect(withTerms).not.toBe(plain);
  });
});
