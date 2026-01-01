/**
 * Database operations for OCR service
 * Handles document status updates and embedding generation/storage
 */

import type { EmbeddingGenerationResult, ProcessingMetadata } from './types.js';

/**
 * Update document status in PostgreSQL
 */
export async function updateDocumentStatus(
  documentId: string,
  status: string,
  postgres: any
): Promise<void> {
  try {
    await postgres.query(
      'UPDATE documents SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [status, documentId]
    );
    console.log(`[OcrService] Document ${documentId} status updated to: ${status}`);
  } catch (error) {
    console.error(`[OcrService] Failed to update document status:`, (error as Error).message);
    throw error;
  }
}

/**
 * Update document with extraction results
 */
export async function updateDocumentWithResults(
  documentId: string,
  text: string,
  pageCount: number,
  extractionInfo: any,
  postgres: any
): Promise<void> {
  try {
    // Store extraction metadata as JSON
    const metadata = {
      extractionMethod: extractionInfo.method,
      pageCount: pageCount,
      textLength: text.length,
      confidence: extractionInfo.confidence,
      extractedAt: new Date().toISOString(),
      stats: extractionInfo.stats
    };

    await postgres.query(
      `UPDATE documents
       SET metadata = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [JSON.stringify(metadata), documentId]
    );

    console.log(`[OcrService] Document ${documentId} updated with extraction results`);
  } catch (error) {
    console.error(`[OcrService] Failed to update document with results:`, (error as Error).message);
    throw error;
  }
}

/**
 * Generate and store embeddings in Qdrant
 */
export async function generateAndStoreEmbeddings(
  userId: string,
  documentId: string,
  text: string,
  metadata: ProcessingMetadata,
  smartChunkDocument: any,
  fastEmbedService: any,
  qdrant: any,
  postgres: any,
  vectorConfig: any
): Promise<EmbeddingGenerationResult> {
  try {
    console.log(`[OcrService] Generating embeddings for document ${documentId}...`);

    // Step 1: Chunk the document using smart chunking
    const chunks = await smartChunkDocument(text, {
      minChunkSize: 100,
      maxChunkSize: 1000,
      chunkOverlap: 200
    });

    if (!chunks || chunks.length === 0) {
      console.warn('[OcrService] No chunks generated from document');
      return { chunksProcessed: 0, embeddings: 0 };
    }

    console.log(`[OcrService] Generated ${chunks.length} chunks from document`);

    // Step 2: Filter out low-quality chunks
    const qualityChunks = chunks.filter((chunk: any) => {
      const text = chunk.text || chunk;
      return text.length >= 50 && /[a-zA-Z]/.test(text);
    });

    console.log(`[OcrService] ${qualityChunks.length} high-quality chunks after filtering`);

    if (qualityChunks.length === 0) {
      console.warn('[OcrService] No high-quality chunks after filtering');
      return { chunksProcessed: 0, embeddings: 0 };
    }

    // Step 3: Generate embeddings in batches
    const chunkTexts = qualityChunks.map((chunk: any) => chunk.text || chunk);
    const embeddings = await fastEmbedService.generateBatchEmbeddings(
      chunkTexts,
      'search_document'
    );

    console.log(`[OcrService] Generated ${embeddings.length} embeddings`);

    // Step 4: Prepare points for Qdrant
    const points = embeddings.map((embedding: number[], index: number) => {
      const chunk = qualityChunks[index];
      const chunkText = chunk.text || chunk;

      return {
        id: `${documentId}_chunk_${index}`,
        vector: embedding,
        payload: {
          user_id: userId,
          document_id: documentId,
          chunk_index: index,
          text: chunkText,
          title: metadata.title || null,
          filename: metadata.filename || null,
          source_type: metadata.sourceType || 'manual',
          created_at: new Date().toISOString(),
          // Include chunk metadata if available
          ...(chunk.metadata || {})
        }
      };
    });

    // Step 5: Store vectors in Qdrant
    const collectionName = vectorConfig.documentCollection || 'user_documents';
    await qdrant.upsert(collectionName, points);

    console.log(`[OcrService] Stored ${points.length} vectors in Qdrant collection: ${collectionName}`);

    // Step 6: Update document vector count in PostgreSQL
    await postgres.query(
      `UPDATE documents
       SET vector_count = $1,
           status = 'completed',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [points.length, documentId]
    );

    console.log(`[OcrService] Document ${documentId} marked as completed with ${points.length} vectors`);

    return {
      chunksProcessed: qualityChunks.length,
      embeddings: embeddings.length
    };
  } catch (error) {
    console.error(`[OcrService] Failed to generate/store embeddings:`, (error as Error).message);

    // Update document status to failed
    try {
      await updateDocumentStatus(documentId, 'failed', postgres);
    } catch (statusError) {
      console.error('[OcrService] Failed to update document status to failed:', (statusError as Error).message);
    }

    throw error;
  }
}
