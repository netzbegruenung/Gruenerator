/**
 * File processing operations
 * Handles file upload processing pipeline
 */

import type { UploadedFile, FileUploadResult } from './types.js';
import { extractTextFromFile, generateContentPreview } from './textExtraction.js';
import { chunkAndEmbedText } from './chunkingPipeline.js';

/**
 * Process a file upload (handles extraction and processing)
 */
export async function processFileUpload(
  postgresDocumentService: any,
  qdrantDocumentService: any,
  userId: string,
  file: UploadedFile,
  title: string,
  sourceType: string = 'manual'
): Promise<FileUploadResult> {
  console.log(`[DocumentProcessingService] Processing file upload: ${title}`);

  const extractedText = await extractTextFromFile(file);

  if (!extractedText || extractedText.trim().length === 0) {
    throw new Error('No text could be extracted from the document');
  }

  const { chunks, embeddings } = await chunkAndEmbedText(extractedText);

  const documentMetadata = await postgresDocumentService.saveDocumentMetadata(userId, {
    title: title.trim(),
    filename: file.originalname,
    sourceType: sourceType,
    vectorCount: chunks.length,
    fileSize: file.size,
    status: 'completed',
    additionalMetadata: {
      content_preview: generateContentPreview(extractedText),
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
      filename: file.originalname,
    }
  );

  console.log(
    `[DocumentProcessingService] Successfully processed: ${title} (${chunks.length} vectors)`
  );

  return {
    id: documentMetadata.id,
    title: documentMetadata.title,
    vectorCount: chunks.length,
    sourceType: sourceType,
  };
}
