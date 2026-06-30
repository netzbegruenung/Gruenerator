/**
 * Shared DocumentProcessor wiring.
 *
 * The scraper and the push-ingest service must build *identical* DocumentProcessor
 * instances so that a given (url, chunkIndex) maps to the same Qdrant point id in
 * both paths — otherwise a push-update and a scrape-update would address different
 * points and duplicate content. This factory is the single source of that wiring:
 * the content hash (`generateContentHash`) and the deterministic point id
 * (`generateLvPointId`) live here, and both callers go through it.
 */
import { generateContentHash } from '../../utils/validation/index.js';
import { DocumentProcessor } from '../scrapers/implementations/LandesverbandScraper/processors/DocumentProcessor.js';

import type { QdrantClient } from '@qdrant/js-client-rest';

/** Default batch size for Qdrant upserts (mirrors the scraper's historical value). */
export const LV_BATCH_SIZE = 10;

/**
 * Deterministic point id from a source url + chunk index. Stable djb2-style hash
 * — must stay byte-for-byte identical to the scraper's original implementation so
 * push and scrape address the same points.
 */
export function generateLvPointId(url: string, chunkIndex: number): number {
  const combinedString = `lv_${url}_${chunkIndex}`;
  let hash = 0;
  for (let i = 0; i < combinedString.length; i++) {
    const char = combinedString.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/**
 * Build a DocumentProcessor bound to a Qdrant client + collection, using the
 * shared hash and point-id functions.
 */
export function createDocumentProcessor(
  qdrantClient: QdrantClient,
  collectionName: string
): DocumentProcessor {
  return new DocumentProcessor(
    qdrantClient,
    collectionName,
    generateContentHash,
    generateLvPointId,
    { batchSize: LV_BATCH_SIZE }
  );
}
