/**
 * Ausgelesenen Text als `documents`-Eintrag samt Vektoren ablegen — neu oder
 * an Stelle eines bestehenden Eintrags (gleiche Id, alte Vektoren raus).
 *
 * Die gemeinsame zweite Hälfte der Cloud-Imports: `WolkeSyncService.processFile`
 * holt Wolke-Dateien, `projectCloudSources` Google-Drive-Dateien; beide lesen
 * den Text selbst aus und übergeben hier. Zwei Kopien dieser Kette hätten
 * irgendwann verschieden gechunkt oder verschiedene Felder gefüllt.
 */
import {
  capStoredText,
  generateContentPreview,
} from '../document-services/DocumentProcessingService/textExtraction.js';
import {
  DocumentSearchService,
  getPostgresDocumentService,
  smartChunkDocument,
} from '../document-services/index.js';
import { mistralEmbeddingService } from '../mistral/index.js';

import type { VectorMetadata } from '../document-services/DocumentSearchService/types.js';
import type {
  DocumentMetadata,
  DocumentUpdateData,
} from '../document-services/PostgresDocumentService/types.js';

export interface StoreExtractedDocumentInput {
  userId: string;
  /** Bestehender Eintrag, der ersetzt wird; `null` legt neu an. */
  existingDocumentId: string | null;
  text: string;
  title: string;
  filename: string;
  fileSize: number;
  /** Felder nur beim Anlegen (Herkunft: `sourceType`, Wolke-Kennungen, `sourceUrl` …). */
  create: Omit<DocumentMetadata, 'title' | 'filename' | 'vectorCount' | 'fileSize' | 'status'>;
  /** Felder nur beim Ersetzen (z. B. der neue ETag). */
  update?: Omit<DocumentUpdateData, 'vectorCount' | 'status' | 'lastSyncedAt'>;
  vectorMetadata: VectorMetadata;
}

export type StoreExtractedDocumentResult =
  | { stored: true; documentId: string; vectorsCreated: number }
  | { stored: false; reason: 'no_extractable_text' | 'no_content' };

let search: DocumentSearchService | null = null;

export async function storeExtractedDocument(
  input: StoreExtractedDocumentInput
): Promise<StoreExtractedDocumentResult> {
  if (!input.text || input.text.trim().length === 0) {
    return { stored: false, reason: 'no_extractable_text' };
  }
  const chunks = await smartChunkDocument(input.text, { preserveSentences: true });
  if (chunks.length === 0) return { stored: false, reason: 'no_content' };

  const embeddings = await mistralEmbeddingService.generateBatchEmbeddings(
    chunks.map((chunk) => chunk.text),
    'search_document'
  );
  const contentPreview = generateContentPreview(input.text);
  const documents = getPostgresDocumentService();
  search ??= new DocumentSearchService();

  let documentId: string;
  if (input.existingDocumentId) {
    documentId = input.existingDocumentId;
    await search.deleteDocumentVectors(documentId, input.userId);
    await documents.updateDocumentMetadata(documentId, input.userId, {
      ...input.update,
      vectorCount: chunks.length,
      lastSyncedAt: new Date().toISOString(),
      status: 'completed',
      markdownContent: capStoredText(input.text),
      additionalMetadata: { content_preview: contentPreview },
    });
  } else {
    const created = await documents.saveDocumentMetadata(input.userId, {
      ...input.create,
      title: input.title,
      filename: input.filename,
      vectorCount: chunks.length,
      fileSize: input.fileSize,
      // Ohne Volltext setzt das Notebook die überlappenden Chunks zusammen (#6144).
      markdownContent: capStoredText(input.text),
      additionalMetadata: { ...input.create.additionalMetadata, content_preview: contentPreview },
      status: 'completed',
    });
    documentId = String(created.id);
  }

  await search.storeDocumentVectors(
    input.userId,
    documentId,
    chunks,
    embeddings,
    input.vectorMetadata
  );
  return { stored: true, documentId, vectorsCreated: chunks.length };
}
