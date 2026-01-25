/**
 * URL processing operations
 * Handles crawled URL content processing
 */

import type { UrlProcessingResult } from './types.js';
import { chunkAndEmbedText } from './chunkingPipeline.js';

/**
 * Process crawled URL content
 */
export async function processUrlContent(
  postgresDocumentService: any,
  qdrantDocumentService: any,
  userId: string,
  url: string,
  title: string,
  content: string,
  sourceType: string = 'manual'
): Promise<UrlProcessingResult> {
  console.log(`[DocumentProcessingService] Processing URL content: ${title}`);

  const { chunks, embeddings } = await chunkAndEmbedText(content);

  const documentMetadata = await postgresDocumentService.saveDocumentMetadata(userId, {
    title: title.trim(),
    filename: `crawled_${Date.now()}.txt`,
    sourceType: sourceType,
    vectorCount: chunks.length,
    fileSize: content.length,
    status: 'completed',
    additionalMetadata: {
      originalUrl: url.trim(),
      wordCount: content.split(/\s+/).filter((word: string) => word.length > 0).length,
      characterCount: content.length,
    },
  });

  await qdrantDocumentService.storeDocumentVectors(
    userId,
    documentMetadata.id,
    chunks,
    embeddings,
    {
      sourceType: sourceType,
      title: title.trim(),
      filename: `crawled_${Date.now()}.txt`,
      additionalPayload: {
        source_url: url.trim(),
        word_count: content.split(/\s+/).filter((word: string) => word.length > 0).length,
        crawled_at: new Date().toISOString(),
      },
    }
  );

  console.log(
    `[DocumentProcessingService] Successfully processed: ${title} (${chunks.length} vectors)`
  );

  return {
    id: documentMetadata.id,
    title: documentMetadata.title,
    vectorCount: chunks.length,
    sourceUrl: url.trim(),
    status: 'completed',
    created_at: documentMetadata.created_at,
    sourceType: sourceType,
  };
}
