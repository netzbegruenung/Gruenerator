import { describe, it, expect } from 'vitest';

import { BaseSearchService } from './BaseSearchService.js';

import type { TransformedChunk } from './types.js';

/**
 * `term_chunk_count` speist die Zeile "mind. N Erwähnungen" auf der
 * Trefferkarte. Die Falle sitzt daneben: `top_chunks` schneidet bei
 * `CONTENT_MAX_CHUNKS_PER_DOC` (10) ab. Wer den Zähler von dort nimmt, bekommt
 * für jedes stark treffende Dokument dieselbe 10 — und merkt es nicht, weil die
 * Zahl plausibel aussieht.
 */
const chunk = (docId: string, index: number, text: string, similarity = 0.8): TransformedChunk =>
  ({
    id: `${docId}-c${index}`,
    document_id: docId,
    documents: { id: docId, title: 'Hitzeschutz für alle', filename: 'hitzeschutz.pdf' },
    chunk_index: index,
    chunk_text: text,
    similarity,
  }) as unknown as TransformedChunk;

const svc = () => new BaseSearchService({ serviceName: 'Test' });

describe('term_chunk_count', () => {
  it('zählt über alle Chunks im Pool, nicht nur über die gelieferten top_chunks', async () => {
    const chunks = Array.from({ length: 12 }, (_, i) =>
      chunk('doc', i, `Abschnitt ${i} über Hitzeschutz in der Stadt.`)
    );

    const [doc] = await svc().groupAndRankHybridResults(chunks, 10, 'Hitzeschutz', {});

    expect(doc?.top_chunks.length).toBeLessThanOrEqual(10);
    expect(doc?.term_chunk_count).toBe(12);
  });

  it('zählt nur die Chunks mit wörtlichem Treffer', async () => {
    const chunks = [
      chunk('doc', 0, 'Abschnitt über Hitzeschutz in der Stadt.'),
      chunk('doc', 1, 'Abschnitt über Baumpflanzungen und Schatten.'),
      chunk('doc', 2, 'Noch einmal Hitzeschutz, diesmal im Quartier.'),
    ];

    const [doc] = await svc().groupAndRankHybridResults(chunks, 10, 'Hitzeschutz', {});

    expect(doc?.chunk_count).toBe(3);
    expect(doc?.term_chunk_count).toBe(2);
  });

  it('bleibt bei einem rein semantischen Treffer auf 0', async () => {
    const chunks = [
      chunk('doc', 0, 'Kühle Innenhöfe und Trinkbrunnen für heisse Tage.', 0.85),
      chunk('doc', 1, 'Verschattung von Spielplätzen im Sommer.', 0.82),
    ];

    const [doc] = await svc().groupAndRankHybridResults(chunks, 10, 'Hitzeschutz', {});

    expect(doc?.term_chunk_count).toBe(0);
  });
});

/**
 * `matched_query_terms` trägt die Mehrwort-Regel der manuellen Suche: welche
 * Inhaltswörter irgendwo im Dokument stehen, auch verteilt über Abschnitte.
 * `term_chunk_count` verlangt dagegen alle Wörter in EINEM Abschnitt.
 */
describe('matched_query_terms', () => {
  it('sammelt Inhaltswörter über alle Chunks und den Titel, ohne Füllwörter', async () => {
    const chunks = [
      chunk('doc', 0, 'Der Senat braucht einen Plan für heisse Sommer.'),
      chunk('doc', 1, 'Viele Schulen haben keine Verschattung.'),
    ];

    const [doc] = await svc().groupAndRankHybridResults(
      chunks,
      10,
      'Hitzeschutz in Berliner Schulen',
      {}
    );

    // "hitzeschutz" aus dem Titel, "schulen" aus Chunk 1, "berliner" nirgends.
    expect(doc?.matched_query_terms).toEqual(['hitzeschutz', 'schulen']);
    expect(doc?.term_chunk_count).toBe(0);
  });
});
