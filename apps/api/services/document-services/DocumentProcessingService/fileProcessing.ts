/**
 * File processing operations
 * Handles file upload processing pipeline
 */

import fs from 'fs';

import { chunkAndEmbedText } from './chunkingPipeline.js';
import { capStoredText, extractTextFromFile, generateContentPreview } from './textExtraction.js';

import type {
  UploadedFile,
  FileUploadResult,
  PostgresDocumentServiceLike,
  QdrantDocumentServiceLike,
} from './types.js';

/**
 * Process a file upload (handles extraction and processing)
 *
 * `knownText` überspringt die Extraktion. Der Chat-Pfad hat den Text zu diesem
 * Zeitpunkt bereits (`processAttachments` → `extractTextFromBase64`), und ohne
 * diesen Parameter lief dieselbe Datei zweimal durch zwei VERSCHIEDENE Ketten:
 * Mistral OCR für Anhang und Zusammenfassung, PDF.js für die Indizierung —
 * denn `extractTextFromDocument` prüft die Direkt-Lesbarkeit vorweg und
 * `extractTextFromBase64` tut das nicht. Zitiert wurde immer die PDF.js-Fassung,
 * weil nur sie in Qdrant landet. Deren Tabellen-Schaden ist mit #2830 behoben:
 * `OcrService/textItemJoin.ts` setzt die pdfjs-Items über die Seiten-Geometrie
 * zusammen, Zeilenwechsel werden zu `\n`, und `evals/extraction/tableExtraction.vitest.ts`
 * schreibt fest, dass alle 16 Zellen wortgetreu und zeilenweise ankommen.
 * Was bleibt: gesperrt gesetzte Spaltenköpfe („D a t e n a r t") — pdfjs baut
 * deren Leerzeichen INNERHALB eines Items in `str` ein, keine Join-Logik erreicht
 * das; der Eval nagelt den Mangel als bestehenden Test fest.
 * Ein Text pro Datei — derselbe, den das Modell im Anhang liest.
 */
export async function processFileUpload(
  postgresDocumentService: PostgresDocumentServiceLike,
  qdrantDocumentService: QdrantDocumentServiceLike,
  userId: string,
  file: UploadedFile,
  title: string,
  sourceType: string = 'manual',
  knownText?: string | null
): Promise<FileUploadResult> {
  console.log(`[DocumentProcessingService] Processing file upload: ${title}`);

  const extractedText = knownText?.trim() ? knownText : await extractTextFromFile(file);

  if (!extractedText || extractedText.trim().length === 0) {
    throw new Error('No text could be extracted from the document');
  }

  const { chunks, embeddings } = await chunkAndEmbedText(extractedText, { title });

  const documentMetadata = await postgresDocumentService.saveDocumentMetadata(userId, {
    title: title.trim(),
    filename: file.originalname,
    sourceType: sourceType,
    vectorCount: chunks.length,
    fileSize: file.size,
    status: 'completed',
    markdownContent: capStoredText(extractedText),
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
  postgresDocumentService: PostgresDocumentServiceLike,
  qdrantDocumentService: QdrantDocumentServiceLike,
  documentId: string,
  userId: string
): Promise<FileUploadResult> {
  console.log(`[DocumentProcessingService] Deferred processing for document: ${documentId}`);

  let filePath: string | null = null;

  // Helper: write current pipeline stage into documents.metadata JSONB so the
  // frontend status poll can surface "Wird gescannt / Wird zerlegt / Wird indexiert".
  // Best-effort — never fails the processing run.
  const markStage = async (
    stage: 'extracting' | 'chunking' | 'upserting',
    progress?: { current: number; total: number }
  ): Promise<void> => {
    try {
      await postgresDocumentService.updateDocumentMetadata(documentId, userId, {
        additionalMetadata: {
          processing_stage: stage,
          processing_progress: progress ? { stage, ...progress } : null,
        },
      });
    } catch (err) {
      console.warn(
        `[DocumentProcessingService] markStage(${stage}) failed for ${documentId}:`,
        (err as Error).message
      );
    }
  };

  try {
    await postgresDocumentService.updateDocumentMetadata(documentId, userId, {
      status: 'processing',
      // Clear a previous run's reason, so a retry doesn't show a stale error.
      additionalMetadata: { processing_error: null },
    });

    const document = await postgresDocumentService.getDocumentById(documentId, userId);
    if (!document) {
      throw new Error('Document not found');
    }

    const metadata = (
      typeof document.metadata === 'string' ? JSON.parse(document.metadata) : document.metadata
    ) as { filePath?: string; mimetype?: string } | null;
    filePath = metadata?.filePath ?? null;

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

    await markStage('extracting');
    const extractedText = await extractTextFromFile(file);
    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error(
        'Aus diesem Dokument konnte kein Text gelesen werden. Prüfe, ob die Datei Text enthält.'
      );
    }

    await markStage('chunking');
    const { chunks, embeddings } = await chunkAndEmbedText(extractedText, {
      title: document.title ?? null,
    });

    await markStage('upserting', { current: 0, total: chunks.length });
    // Clear anything a previous attempt wrote before upserting. Chunk ids are
    // derived from the position, so a retry that produces fewer chunks would
    // leave the surplus behind — orphaned points that still match searches.
    // Cheap no-op on a first run, and it makes re-processing idempotent.
    if (qdrantDocumentService.deleteDocumentVectors) {
      try {
        await qdrantDocumentService.deleteDocumentVectors(documentId, userId);
      } catch (err) {
        console.warn(
          `[DocumentProcessingService] Vektor-Vorreinigung für ${documentId} übersprungen:`,
          (err as Error).message
        );
      }
    }
    await qdrantDocumentService.storeDocumentVectors(
      userId,
      documentId,
      chunks,
      embeddings,
      {
        sourceType: document.source_type || 'manual',
        title: document.title,
        filename: document.filename,
      },
      async (upserted, total) => {
        await markStage('upserting', { current: upserted, total });
      }
    );

    await postgresDocumentService.updateDocumentMetadata(documentId, userId, {
      status: 'completed',
      vectorCount: chunks.length,
      // Keep the extracted text: the source file is deleted right below and the
      // chunks in Qdrant are overlapping fragments, so without this the only way
      // back to the full text is re-fetching (and for uploads, not at all).
      markdownContent: capStoredText(extractedText),
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
      // Keep the reason with the row: `status='failed'` alone left the upload UI
      // with nothing to say, so the spinner simply vanished and the document
      // looked fine while being unsearchable.
      await postgresDocumentService.updateDocumentMetadata(documentId, userId, {
        status: 'failed',
        additionalMetadata: {
          processing_error: error instanceof Error ? error.message : 'Verarbeitung fehlgeschlagen',
          processing_stage: null,
          processing_progress: null,
        },
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
