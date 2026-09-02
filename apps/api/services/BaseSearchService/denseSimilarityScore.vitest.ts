import { describe, it, expect } from 'vitest';

import { BaseSearchService } from './BaseSearchService.js';

import type { TransformedChunk } from './types.js';

/**
 * #3166 Fix-Runde 1: `dense_similarity_score` darf nur aus dem
 * server-seitigen Score-Join kommen. `originalVectorScore` trägt auf JEDEM
 * Pfad einen echten Kosinus (auch der Alt-Fusion) — würde `dense_similarity_score`
 * daraus abgeleitet, würde der Notebook-Schnitt auf dem Alt-Pfad gegen den
 * unboosteten Kosinus statt gegen das dort tatsächlich verwendete, geboostete
 * `similarity_score` laufen und die 42 Alt-Kontrollfälle verschieben. Diese
 * Tests gehen deshalb durch `groupAndRankHybridResults` (→
 * `calculateHybridDocumentScore`) und nicht über einen synthetischen
 * `dense_similarity`-Wert, damit der reale Boost-Effekt sichtbar bleibt.
 */
const chunk = (
  docId: string,
  text: string,
  similarity: number,
  extra: {
    originalVectorScore?: number | null;
    originalTextScore?: number | null;
    denseSimilarityScore?: number | null;
  } = {}
): TransformedChunk =>
  ({
    id: `${docId}-c0`,
    document_id: docId,
    documents: { id: docId, title: docId, filename: docId },
    chunk_index: 0,
    chunk_text: text,
    similarity,
    searchMethod: 'hybrid',
    originalVectorScore: extra.originalVectorScore ?? null,
    originalTextScore: extra.originalTextScore ?? null,
    denseSimilarityScore: extra.denseSimilarityScore ?? null,
  }) as unknown as TransformedChunk;

const svc = () => new BaseSearchService({ serviceName: 'Test' });

describe('dense_similarity_score gilt nur für den server-seitigen Score-Join', () => {
  it('bleibt auf dem Alt-Pfad null, obwohl vectorScores gefüllt ist — geschnitten wird auf dem geboosteten similarity_score', async () => {
    // Alt-Fusion: `originalVectorScore` ist ein echter, aber unboosteter
    // Kosinus (0.5). Der Begriff "Klimaschutz" steckt wörtlich im Chunk, was
    // similarity_score einen Begriffstreffer-Bonus (+0.12) und — weil sowohl
    // Vektor- als auch Text-Lane trafen — einen Hybrid-Bonus (+0.05) einbringt.
    const [doc] = await svc().groupAndRankHybridResults(
      [
        chunk('legacy-doc', 'Der Klimaschutz braucht mehr Tempo.', 0.5, {
          originalVectorScore: 0.5,
          originalTextScore: 0.3,
        }),
      ],
      10,
      'Klimaschutz',
      {}
    );

    expect(doc?.dense_similarity_score).toBeNull();
    // similarity_score liegt über dem rohen Kosinus 0.5 — genau der Abstand,
    // gegen den ein Schnitt auf dem rohen Kosinus falsch gerechnet hätte.
    expect(doc?.similarity_score).toBeGreaterThan(0.5);
  });

  it('trägt den gemessenen Kosinus aus dem Score-Join, unabhängig vom Fusionswert', async () => {
    // Server-Pfad: `similarity` ist ein RRF-Fusionswert nahe 1.0, der
    // gemessene dichte Kosinus aus dem Join liegt weit darunter bei 0.21 —
    // dieselbe Naht wie im Aufgabenbrief (Task 3, "wirft einen hohen
    // Fusionswert mit zu kleinem Kosinus weg").
    // originalVectorScore und denseSimilarityScore bewusst UNGLEICH: die
    // Vorfix-Implementierung (Math.max(...vectorScores)) hätte hier 0.77
    // zurückgegeben, nicht 0.21 — nur ein Feld, das den Server-Join wirklich
    // gesondert trägt, besteht diesen Test.
    const [doc] = await svc().groupAndRankHybridResults(
      [
        chunk('server-doc', 'Text ohne Bezug zur Anfrage.', 0.98, {
          originalVectorScore: 0.77,
          denseSimilarityScore: 0.21,
        }),
      ],
      10,
      'eine ganz andere Anfrage',
      {}
    );

    expect(doc?.dense_similarity_score).toBe(0.21);
  });
});
