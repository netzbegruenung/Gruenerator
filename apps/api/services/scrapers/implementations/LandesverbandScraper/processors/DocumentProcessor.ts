/**
 * Document Processor
 * Orchestrates document processing and storage pipeline
 * Handles: validation, age filter, deduplication, chunking, embedding, storage
 */

import { smartChunkDocument } from '../../../../document-services/index.js';
import { mistralEmbeddingService } from '../../../../mistral/index.js';
import { scrollDocuments, batchDelete, batchUpsert } from '../../../../../database/services/QdrantService/operations/batchOperations.js';
import { CONTENT_TYPE_LABELS } from '../../../../../config/landesverbaendeConfig.js';
import type { ProcessResult, ExtractedContent } from '../types.js';
import { DateExtractor } from '../extractors/DateExtractor.js';
import type { QdrantClient } from '@qdrant/js-client-rest';

/**
 * Document processing orchestration
 * Dependencies injected via constructor for testability
 */
export class DocumentProcessor {
  constructor(
    private qdrantClient: QdrantClient,
    private collectionName: string,
    private generateHash: (text: string) => string,
    private generatePointId: (url: string, chunkIndex: number) => number,
    private config: { batchSize: number }
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
    const existingPoints = await scrollDocuments(
      this.qdrantClient,
      this.collectionName,
      {
        must: [{ key: 'source_url', match: { value: url } }],
      },
      {
        limit: 1,
        withPayload: true,
        withVector: false,
      }
    );

    const existing = existingPoints.length > 0 ? {
      content_hash: existingPoints[0].payload.content_hash as string,
      indexed_at: existingPoints[0].payload.indexed_at as string,
    } : null;

    if (existing && existing.content_hash === contentHash) {
      return { stored: false, reason: 'unchanged' };
    }

    // STEP 4: Delete old version if exists (update scenario)
    if (existing) {
      await batchDelete(
        this.qdrantClient,
        this.collectionName,
        {
          must: [{ key: 'source_url', match: { value: url } }],
        }
      );
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
    const embeddings = await mistralEmbeddingService.generateBatchEmbeddings(chunkTexts);

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
    const batchSize = this.config.batchSize;
    for (let i = 0; i < points.length; i += batchSize) {
      const batch = points.slice(i, i + batchSize);
      await batchUpsert(this.qdrantClient, this.collectionName, batch);
    }

    return {
      stored: true,
      chunks: chunks.length,
      vectors: points.length,
      updated: !!existing,
    };
  }
}
