/**
 * File processing operations
 * Handles file upload processing pipeline
 */

import fs from 'fs';

import { hasAiConsent } from '../../../middleware/requireAiConsent.js';

import { chunkAndEmbedText } from './chunkingPipeline.js';
import { fetchOriginal, reindexOrigin, type ReindexOrigin } from './reindexOrigin.js';
import {
  capStoredText,
  extractDocumentFromFile,
  generateContentPreview,
  type FileExtraction,
} from './textExtraction.js';

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
 *
 * `knownPageCount` gehört zu `knownText`: die Seitenzahl aus derselben Extraktion.
 */
export async function processFileUpload(
  postgresDocumentService: PostgresDocumentServiceLike,
  qdrantDocumentService: QdrantDocumentServiceLike,
  userId: string,
  file: UploadedFile,
  title: string,
  sourceType: string = 'manual',
  knownText?: string | null,
  knownPageCount: number | null = null
): Promise<FileUploadResult> {
  console.log(`[DocumentProcessingService] Processing file upload: ${title}`);

  const extraction: FileExtraction = knownText?.trim()
    ? { text: knownText, pageCount: knownPageCount, extractionMethod: null }
    : await extractDocumentFromFile(file, { pageMarkers: true });
  const extractedText = extraction.text;

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
    ...(extraction.pageCount !== null ? { pageCount: extraction.pageCount } : {}),
    additionalMetadata: {
      content_preview: generateContentPreview(extractedText),
      ...(extraction.extractionMethod ? { extractionMethod: extraction.extractionMethod } : {}),
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

/** Die Markierungen eines Neu-Indexierens, entfernt, sobald der Lauf endet. */
const REINDEX_DONE = {
  reindex_origin: undefined,
  reindex_prev_searchable: undefined,
  queued_at: undefined,
} as const;

/**
 * Was ein Neu-Indexieren aus der alten Nutzlast mitnehmen muss, weil es die
 * Punkte löscht und neu schreibt: Datum und Gremium, sobald der
 * Metadaten-Worker sie gesetzt hat. Der Worker läuft für
 * ein Dokument nicht zweimal; ohne das hier wären sie nach dem ersten Klick weg.
 */
function reindexCarryPayload(metadata: Record<string, unknown> | null): Record<string, unknown> {
  const docMeta = metadata?.doc_meta;
  const gremium =
    docMeta && typeof docMeta === 'object' ? (docMeta as { gremium?: unknown }).gremium : null;
  return {
    ...(typeof metadata?.published_at === 'string' ? { published_at: metadata.published_at } : {}),
    ...(typeof gremium === 'string' && gremium ? { gremium } : {}),
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
  // Gesetzt, wenn die Zeile über „Neu indexieren" kam und das Original erst
  // geholt werden muss. Bis `vectorsReplaced` bleiben die alten Punkte stehen.
  let reindex: ReindexOrigin | null = null;
  let vectorsReplaced = false;
  // Nur wer vorher durchsuchbar war, fällt bei einem Fehlschlag auf die alte
  // Fassung zurück; eine schon kaputte Quelle bleibt `failed`, mit Grund.
  let prevSearchable = false;

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
    // Art.-9-Einwilligung: der Ingest läuft im Worker ohne Request (Upload-Assistent,
    // Notebook-Speichern, Wolke). OCR und Einbettung sind KI-Verarbeitung; der
    // catch unten verbucht das Dokument mit diesem Grund als gescheitert.
    if (!(await hasAiConsent(userId))) {
      throw new Error('Für die KI-Verarbeitung fehlt die Einwilligung nach Art. 9 DSGVO.');
    }

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
    ) as
      | ({ filePath?: string; mimetype?: string; reindex_origin?: unknown } & Record<
          string,
          unknown
        >)
      | null;
    filePath = metadata?.filePath ?? null;

    await markStage('extracting');
    let file: UploadedFile;
    if (filePath && fs.existsSync(filePath)) {
      const buffer = fs.readFileSync(filePath);
      file = {
        buffer,
        mimetype: metadata?.mimetype || 'application/octet-stream',
        originalname: document.filename || 'document',
        size: buffer.length,
      };
    } else {
      reindex = metadata?.reindex_origin
        ? reindexOrigin({
            id: documentId,
            user_id: userId,
            filename: document.filename ?? null,
            status: null,
            wolke_share_link_id:
              typeof document.wolke_share_link_id === 'string'
                ? document.wolke_share_link_id
                : null,
            wolke_file_path:
              typeof document.wolke_file_path === 'string' ? document.wolke_file_path : null,
          })
        : null;
      if (!reindex) throw new Error('Uploaded file not found on disk');
      prevSearchable = metadata?.reindex_prev_searchable === true;
      file = await fetchOriginal(reindex, document, userId);
    }

    const extraction = await extractDocumentFromFile(file, { pageMarkers: true });
    const extractedText = extraction.text;
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
    if (reindex) {
      // Ab hier gibt es die alte Fassung nicht mehr. Erst in der Zeile
      // festhalten, dann löschen: stürzt der Lauf danach ab und gibt der Worker
      // auf, darf er nicht auf „bisherige Fassung bleibt durchsuchbar" fallen.
      // Nicht best-effort — ohne die Markierung wird nicht gelöscht.
      await postgresDocumentService.updateDocumentMetadata(documentId, userId, {
        additionalMetadata: { reindex_prev_searchable: false },
      });
      prevSearchable = false;
    }
    vectorsReplaced = true;
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
        // Ein neu indexiertes Dokument behält, was sein erster Ingest in die
        // Nutzlast schrieb: die Wolke-Herkunft.
        ...(reindex?.kind === 'wolke'
          ? { wolkeShareLinkId: reindex.shareLinkId, wolkeFilePath: reindex.filePath }
          : {}),
        ...(reindex ? { additionalPayload: reindexCarryPayload(metadata) } : {}),
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
      ...(extraction.pageCount !== null ? { pageCount: extraction.pageCount } : {}),
      additionalMetadata: {
        // Nur die eigenen Felder — der Rest wird in der Datenbank
        // zusammengeführt, damit Tags oder Metadaten, die während des Laufs
        // jemand anderes schrieb, nicht vom Schnappschuss überschrieben werden.
        filePath: undefined,
        ...REINDEX_DONE,
        content_preview: generateContentPreview(extractedText),
        ...(extraction.extractionMethod ? { extractionMethod: extraction.extractionMethod } : {}),
      },
    });

    // Clean up temp file (a reindex fetched its original into memory)
    if (filePath && !reindex) {
      try {
        fs.unlinkSync(filePath);
        const dir = filePath.substring(0, filePath.lastIndexOf('/'));
        if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
          fs.rmdirSync(dir);
        }
      } catch {
        // Non-critical cleanup error
      }
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
      if (reindex && !vectorsReplaced && prevSearchable) {
        // Das Original war nicht zu holen oder nicht zu lesen, die alten Punkte
        // stehen noch: die Quelle bleibt durchsuchbar, der Grund steht dabei.
        await postgresDocumentService.updateDocumentMetadata(documentId, userId, {
          status: 'completed',
          additionalMetadata: {
            ...REINDEX_DONE,
            processing_error: `Neu indexieren fehlgeschlagen: ${
              error instanceof Error ? error.message : 'unbekannter Fehler'
            } Die bisherige Fassung bleibt durchsuchbar.`,
            processing_stage: null,
            processing_progress: null,
          },
        });
      } else {
        // Keep the reason with the row: `status='failed'` alone left the upload UI
        // with nothing to say, so the spinner simply vanished and the document
        // looked fine while being unsearchable.
        await postgresDocumentService.updateDocumentMetadata(documentId, userId, {
          status: 'failed',
          additionalMetadata: {
            ...(reindex ? REINDEX_DONE : {}),
            processing_error: reindex
              ? `Neu indexieren fehlgeschlagen: ${error instanceof Error ? error.message : 'unbekannter Fehler'}`
              : error instanceof Error
                ? error.message
                : 'Verarbeitung fehlgeschlagen',
            processing_stage: null,
            processing_progress: null,
          },
        });
      }
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
