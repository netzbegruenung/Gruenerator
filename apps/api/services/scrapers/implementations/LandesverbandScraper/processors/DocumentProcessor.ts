/**
 * Document Processor
 * Orchestrates document processing and storage pipeline
 * Handles: validation, age filter, deduplication, chunking, embedding, storage
 */

import { smartChunkDocument } from '../../../../../utils/textChunker.js';
import { fastEmbedService } from '../../../FastEmbedService.js';
import { CONTENT_TYPE_LABELS } from '../../../../../config/landesverbaendeConfig.js';
import type { QdrantOperations } from '../operations/QdrantOperations.js';
import type { ProcessResult, ExtractedContent } from '../types.js';
import { DateExtractor } from '../extractors/DateExtractor.js';

/**
 * Document processing orchestration
 * Dependencies injected via constructor for testability
 */
export class DocumentProcessor {
  constructor(
    private qdrantOps: QdrantOperations,
    private generateHash: (text: string) => string,
    private generatePointId: (url: string, chunkIndex: number) => number,
    private config: { collectionName: string; batchSize: number }
  ) {}

  /**
   * Process and store document in Qdrant
   * Full pipeline: validate → deduplicate → chunk → embed → store
   */
  async processAndStoreDocument(
    source: any,
    contentType: string,
    url: string,
    content: ExtractedContent
  ): Promise<ProcessResult> {
    const { title, text, publishedAt, categories } = content;

    // STEP 1: Validation - minimum length check
    if (!text || text.length < 100) {
      return { stored: false, reason: 'too_short' };
    }

    // STEP 2: Age filter - skip content older than 10 years
    if (publishedAt) {
      const pubDate = new Date(publishedAt);
      if (DateExtractor.isDateTooOld(pubDate, 10)) {
        return { stored: false, reason: 'too_old' };
      }
    }

    // STEP 3: Deduplication check
    const contentHash = this.generateHash(text);
    const existing = await this.qdrantOps.documentExists(url);

    if (existing && existing.content_hash === contentHash) {
      return { stored: false, reason: 'unchanged' };
    }

    // STEP 4: Delete old version if exists (update scenario)
    if (existing) {
      await this.qdrantOps.deleteDocument(url);
    }

    // STEP 5: Build document title
    const documentTitle = title || `${source.name} - ${(CONTENT_TYPE_LABELS as any)[contentType] || contentType}`;

    // STEP 6: Chunk document
    const chunks = await smartChunkDocument(text, {
      baseMetadata: {
        title: documentTitle,
        source: 'landesverbaende_gruene',
        source_url: url,
      },
    });

    if (chunks.length === 0) {
      return { stored: false, reason: 'no_chunks' };
    }

    // STEP 7: Generate embeddings
    const chunkTexts = chunks.map((c: any) => c.text || c.chunk_text);
    const embeddings = await fastEmbedService.generateBatchEmbeddings(chunkTexts);

    // STEP 8: Build Qdrant points
    const points = chunks.map((chunk, index) => ({
      id: this.generatePointId(url, index),
      vector: embeddings[index],
      payload: {
        document_id: `lv_${contentHash}`,
        source_url: url,
        source_id: source.id,
        source_name: source.name,
        landesverband: source.shortName,
        source_type: source.type,
        content_type: contentType,
        content_type_label: (CONTENT_TYPE_LABELS as any)[contentType] || contentType,
        content_hash: contentHash,
        chunk_index: index,
        chunk_text: chunkTexts[index],
        title: documentTitle,
        primary_category: categories?.[0] || null,
        subcategories: categories || [],
        published_at: publishedAt || null,
        indexed_at: new Date().toISOString(),
        source: 'landesverbaende_gruene',
      },
    }));

    // STEP 9: Store in batches
    await this.qdrantOps.upsertPoints(points, this.config.batchSize);

    return {
      stored: true,
      chunks: chunks.length,
      vectors: points.length,
      updated: !!existing,
    };
  }
}
