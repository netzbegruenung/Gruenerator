/**
 * DocumentSearchService Scoring Module
 *
 * Was hier steht, ist die Aufbereitung eines Chunks und die Relevanz-Zeile.
 *
 * Die Dokument-Bewertung steht bewusst NICHT hier, sondern in
 * `services/BaseSearchService/scoring.ts` — dort ruft
 * `groupAndRankHybridResults` sie als Modulfunktion auf, nicht über `this`.
 * Bis 08/2026 lag eine zweite, leicht abweichende Fassung an dieser Stelle
 * (Qualitätsfaktor statt Positionsgewicht, `similarity` statt
 * `similarity_adjusted`), erreichbar nur über zwei Methoden, die niemand rief.
 * Sie hat einen ganzen Befund erzeugt: der Lexik-Zuschlag galt als tot, weil
 * *diese* Kopie ihn nicht las — die lebende las ihn die ganze Zeit (#2891).
 * Wer Bewertung ändern will, ändert sie drüben.
 */

import type { DocumentChunkData, DocumentEnhancedScore, DocumentRawChunk } from './types.js';

/**
 * Extract chunk data with quality metadata
 *
 * Transforms raw chunk from database into structured chunk data
 * with quality information included.
 *
 * @param chunk - Raw chunk from search result
 * @returns Structured chunk data
 */
export function extractChunkData(chunk: DocumentRawChunk): DocumentChunkData {
  return {
    chunk_id: chunk.id,
    chunk_index: chunk.chunk_index,
    text: chunk.chunk_text,
    content_type: chunk.content_type ?? null,
    page_number: chunk.page_number ?? null,
    chunk_type: chunk.chunk_type ?? null,
    similarity: chunk.similarity,
    token_count: chunk.token_count,
    ...(typeof chunk.quality_score === 'number' && { quality_score: chunk.quality_score }),
    searchMethod: chunk.searchMethod,
    originalVectorScore: chunk.originalVectorScore ?? null,
    originalTextScore: chunk.originalTextScore ?? null,
  };
}

/**
 * Build relevance information string with quality metrics
 *
 * Creates human-readable relevance description including:
 * - Similarity score
 * - Quality average (if available)
 *
 * @param doc - Document result data
 * @param enhancedScore - Enhanced score with quality information
 * @returns Formatted relevance string
 */
export function buildRelevanceInfo(
  doc: { similarity_score: number },
  enhancedScore: DocumentEnhancedScore
): string {
  let base = `Relevance: ${(doc.similarity_score * 100).toFixed(1)}%`;

  if (typeof enhancedScore.qualityAvg === 'number') {
    base += ` (quality avg: ${enhancedScore.qualityAvg.toFixed(2)})`;
  }

  return base;
}
