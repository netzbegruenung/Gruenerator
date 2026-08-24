import { describe, it, expect, vi, beforeEach } from 'vitest';

const rerank = vi.hoisted(() => vi.fn<(...a: unknown[]) => Promise<unknown>>());
vi.mock('../search/rerankPipeline.js', () => ({
  rerankPipeline: (...a: unknown[]) => rerank(...a),
  DEFAULT_RELEVANCE: 0.5,
}));

import { BaseSearchService } from './BaseSearchService.js';

import type { TransformedChunk } from './types.js';

/** Ein Chunk, wie ihn Qdrant nach der Transformation liefert. */
const chunk = (id: string, text: string, similarity: number): TransformedChunk =>
  ({
    id,
    document_id: 'doc-1',
    documents: { id: 'doc-1', title: 'Datenschutz.pdf', filename: 'Datenschutz.pdf' },
    chunk_index: Number(id.slice(1)),
    chunk_text: text,
    similarity,
  }) as unknown as TransformedChunk;

/** Antwort des Cross-Encoders: Reihenfolge und Punkte über die Pool-Indizes. */
const verdict = (scores: number[]) => ({
  rankedIndices: scores.map((_, i) => i).sort((a, b) => scores[b]! - scores[a]!),
  scores: new Map(scores.map((s, i) => [i, s])),
  rerankTimeMs: 42,
});

const svc = () => new BaseSearchService({ serviceName: 'Test' });

const chunks = [
  chunk('c0', 'Allgemeines zur Verarbeitung personenbezogener Daten.', 0.86),
  chunk('c1', 'Zweite Passage ohne besonderen Bezug.', 0.82),
  chunk('c2', 'Übersicht der Speicherfristen: Server-Logs 7 Tage, GlitchTip 90 Tage.', 0.78),
  chunk('c3', 'Vierte Passage.', 0.7),
];

describe('Chunk-Reranking vor der Gruppierung', () => {
  beforeEach(() => rerank.mockReset());

  /**
   * Der Kern: die Reihenfolge im Treffer IST die Auswahl, weil der
   * Registry-Deckel den Schwanz abschneidet. Kosinus hatte die Fristen-Passage
   * auf Platz drei — mit dem Cross-Encoder steht sie vorn.
   */
  it('stellt die vom Cross-Encoder bevorzugte Passage nach vorn', async () => {
    rerank.mockResolvedValue(verdict([0.1, 0.05, 0.9, 0.02]));

    const [doc] = await svc().groupAndRankHybridResults(chunks, 10, 'Löschfristen', {
      rerankChunks: true,
    });

    expect(doc?.relevant_content.startsWith('Übersicht der Speicherfristen')).toBe(true);
    expect(doc?.top_chunks?.[0]?.chunk_index).toBe(2);
  });

  it('lässt ohne die Option alles beim Kosinus — und ruft den Encoder nicht', async () => {
    const [doc] = await svc().groupAndRankHybridResults(chunks, 10, 'Löschfristen', {});

    expect(doc?.relevant_content.startsWith('Allgemeines zur Verarbeitung')).toBe(true);
    expect(rerank).not.toHaveBeenCalled();
  });

  /**
   * `rerankPipeline` wirft nie, es meldet `failed`. Der Rückfall muss die
   * Kosinus-Reihenfolge sein — also exakt das Verhalten ohne die Option.
   */
  it('fällt bei einem Ausfall des Rerankers auf den Kosinus zurück', async () => {
    rerank.mockResolvedValue({ ...verdict([0, 0, 0, 0]), failed: true });

    const [doc] = await svc().groupAndRankHybridResults(chunks, 10, 'Löschfristen', {
      rerankChunks: true,
    });

    expect(doc?.relevant_content.startsWith('Allgemeines zur Verarbeitung')).toBe(true);
  });

  it('spart den Aufruf bei einer leeren Abfrage', async () => {
    await svc().groupAndRankHybridResults(chunks, 10, '', { rerankChunks: true });
    expect(rerank).not.toHaveBeenCalled();
  });

  /**
   * Der Encoder bekommt den Chunk UNGEKÜRZT — das ist der ganze Unterschied zu
   * `rerankNode`, das Kandidaten auf 1200 Zeichen schneidet und damit Köpfe
   * beurteilt (`firstRelevantOffset` 3219/9966/8673 in #2289).
   */
  it('reicht den Chunk ungekürzt an den Encoder', async () => {
    const lang = 'A'.repeat(1_400);
    rerank.mockResolvedValue(verdict([1, 0, 0, 0]));

    await svc().groupAndRankHybridResults(
      [chunk('c0', lang, 0.9), ...chunks.slice(1)],
      10,
      'Löschfristen',
      { rerankChunks: true }
    );

    const items = (rerank.mock.calls[0]?.[0] as { items: { content: string }[] }).items;
    expect(items[0]?.content).toBe(lang);
  });
});
