/**
 * Text processing operations
 * Handles direct text content processing (no file upload)
 */

import { createLogger } from '../../../utils/logger.js';

import { chunkAndEmbedText } from './chunkingPipeline.js';
import { generateContentPreview } from './textExtraction.js';

import type {
  TextProcessingResult,
  PostgresDocumentServiceLike,
  QdrantDocumentServiceLike,
} from './types.js';

const log = createLogger('textProcessing');

/**
 * Process text content directly (no file upload)
 */
export async function processTextContent(
  postgresDocumentService: PostgresDocumentServiceLike,
  qdrantDocumentService: QdrantDocumentServiceLike,
  userId: string,
  title: string,
  content: string,
  sourceType: string = 'manual'
): Promise<TextProcessingResult> {
  log.debug(`[DocumentProcessingService] Processing text: ${title} (${content.length} chars)`);

  if (!content || content.trim().length === 0) {
    throw new Error('Text content is required');
  }

  if (!title || title.trim().length === 0) {
    throw new Error('Title is required');
  }

  const { chunks, embeddings } = await chunkAndEmbedText(content.trim());

  const documentMetadata = await postgresDocumentService.saveDocumentMetadata(userId, {
    title: title.trim(),
    filename: 'manual_text_input.txt',
    sourceType: sourceType,
    vectorCount: chunks.length,
    fileSize: content.length,
    status: 'completed',
    additionalMetadata: {
      content_preview: generateContentPreview(content),
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
      filename: 'manual_text_input.txt',
    }
  );

  log.debug(
    `[DocumentProcessingService] Successfully processed: ${title} (${chunks.length} vectors)`
  );

  return {
    id: documentMetadata.id,
    title: documentMetadata.title,
    vectorCount: chunks.length,
    sourceType: sourceType,
  };
}
