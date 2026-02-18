/**
 * File processing operations
 * Handles file upload processing pipeline
 */

import fs from 'fs';

import { chunkAndEmbedText } from './chunkingPipeline.js';
import { extractTextFromFile, generateContentPreview } from './textExtraction.js';

import type { UploadedFile, FileUploadResult } from './types.js';

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

/**
 * Process a previously uploaded document (deferred OCR + vectorization).
 * Reads the file from disk, extracts text, chunks, embeds, and stores vectors.
 * Updates the document status throughout the process.
 */
export async function processUploadedDocument(
  postgresDocumentService: any,
  qdrantDocumentService: any,
  documentId: string,
  userId: string
): Promise<FileUploadResult> {
  console.log(`[DocumentProcessingService] Deferred processing for document: ${documentId}`);

  let filePath: string | null = null;

  try {
    await postgresDocumentService.updateDocumentMetadata(documentId, userId, {
      status: 'processing',
    });

    const document = await postgresDocumentService.getDocumentById(documentId, userId);
    if (!document) {
      throw new Error('Document not found');
    }

    const metadata =
      typeof document.metadata === 'string' ? JSON.parse(document.metadata) : document.metadata;
    filePath = metadata?.filePath;

    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error('Uploaded file not found on disk');
    }

    const buffer = fs.readFileSync(filePath);
    const file: UploadedFile = {
      buffer,
      mimetype: metadata?.mimetype || 'application/octet-stream',
      originalname: document.filename || 'document',
      size: buffer.length,
    };

    const extractedText = await extractTextFromFile(file);
    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error('No text could be extracted from the document');
    }

    const { chunks, embeddings } = await chunkAndEmbedText(extractedText);

    await qdrantDocumentService.storeDocumentVectors(userId, documentId, chunks, embeddings, {
      sourceType: document.source_type || 'manual',
      title: document.title,
      filename: document.filename,
    });

    await postgresDocumentService.updateDocumentMetadata(documentId, userId, {
      status: 'completed',
      vectorCount: chunks.length,
      additionalMetadata: {
        ...metadata,
        filePath: undefined,
        content_preview: generateContentPreview(extractedText),
      },
    });

    // Clean up temp file
    try {
      fs.unlinkSync(filePath);
      const dir = filePath.substring(0, filePath.lastIndexOf('/'));
      if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
        fs.rmdirSync(dir);
      }
    } catch {
      // Non-critical cleanup error
    }

    console.log(
      `[DocumentProcessingService] Deferred processing complete: ${document.title} (${chunks.length} vectors)`
    );

    return {
      id: documentId,
      title: document.title,
      vectorCount: chunks.length,
      sourceType: document.source_type || 'manual',
    };
  } catch (error) {
    console.error(
      `[DocumentProcessingService] Deferred processing failed for ${documentId}:`,
      error
    );

    try {
      await postgresDocumentService.updateDocumentMetadata(documentId, userId, {
        status: 'failed',
      });
    } catch {
      // Ignore status update failure
    }

    // Clean up temp file on error
    if (filePath) {
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch {
        // Non-critical
      }
    }

    throw error;
  }
}
