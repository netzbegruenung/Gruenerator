/**
 * DocumentSearchService Document Retrieval Module
 *
 * Handles reconstruction of full document text from stored vector chunks:
 * - Single document full text retrieval
 * - Bulk document retrieval (optimized)
 * - First chunk extraction for previews
 */

import type {
  DocumentFullTextResult,
  DocumentChunksResult,
  DocumentChunkItem,
  BulkDocumentResult,
  BulkDocumentData,
  BulkDocumentError,
  FirstChunksResult,
  QdrantFilter,
  QdrantDocument,
  ChunkContextItem,
  ChunkWithContextResult,
  InspectedChunkRow,
  InspectedPayloadSummary,
  InspectDocumentChunksResult,
} from './types.js';
import type { QdrantOperations } from '../../../database/services/QdrantOperations.js';
import type { ScrollPoint } from '../../../database/services/QdrantService/operations/types.js';

/**
 * Get full document text from Qdrant vectors
 *
 * Reconstructs the complete document by:
 * 1. Fetching all chunks for the document
 * 2. Sorting by chunk_index
 * 3. Joining chunk texts with double newlines
 *
 * @param qdrantOps - QdrantOperations instance
 * @param userId - User ID who owns the document
 * @param documentId - Document ID to retrieve
 * @returns Full text result with metadata
 */
export async function getDocumentFullText(
  qdrantOps: QdrantOperations,
  userId: string,
  documentId: string
): Promise<DocumentFullTextResult> {
  try {
    const filter: QdrantFilter = {
      must: [
        { key: 'user_id', match: { value: userId } },
        { key: 'document_id', match: { value: documentId } },
      ],
    };

    const chunks = await qdrantOps.scrollDocuments('documents', filter, {
      limit: 1000,
      withPayload: true,
      withVector: false,
    });

    if (!chunks || chunks.length === 0) {
      return {
        success: false,
        fullText: '',
        chunkCount: 0,
        error: 'No chunks found for document',
      };
    }

    const sortedChunks = chunks
      .sort((a, b) => {
        const indexA = typeof a.payload.chunk_index === 'number' ? a.payload.chunk_index : 0;
        const indexB = typeof b.payload.chunk_index === 'number' ? b.payload.chunk_index : 0;
        return indexA - indexB;
      })
      .map((chunk) => {
        const text = chunk.payload.chunk_text;
        return typeof text === 'string' ? text : '';
      })
      .filter((text) => text.trim().length > 0);

    const fullText = sortedChunks.join('\n\n');

    console.log(
      `[DocumentRetrieval] Reconstructed ${fullText.length} chars from ${sortedChunks.length} chunks for document ${documentId}`
    );

    return {
      success: true,
      fullText: fullText,
      chunkCount: sortedChunks.length,
      totalCharsReconstructed: fullText.length,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[DocumentRetrieval] Error getting full document text:', error);
    return {
      success: false,
      fullText: '',
      chunkCount: 0,
      error: errorMessage,
    };
  }
}

/**
 * Identitätsklausel für Dokumente in expliziten Qdrant-Collections: gescrapte
 * Systemsammlungen (kommunalwiki_documents, grundsatz_documents, …) tragen
 * KEIN document_id in der Nutzlast — ihre Identität ist die indizierte
 * source_url, und genau diese URL mintet SearchResultProcessor.ts:39
 * (`r.document_id || sourceUrl`) als documentId der Zitationen. Eine
 * URL-förmige ID ist also per Konstruktion eine source_url; alles andere
 * bleibt beim document_id-Filter.
 */
function documentIdentityClause(documentId: string): { key: string; match: { value: string } } {
  const key = /^https?:\/\//.test(documentId) ? 'source_url' : 'document_id';
  return { key, match: { value: documentId } };
}

/**
 * Get individual chunks for a document, sorted by chunk_index.
 * Supports both user documents (in 'documents' collection with user_id)
 * and system documents (in named collections without user_id).
 */
export async function getDocumentChunks(
  qdrantOps: QdrantOperations,
  userId: string,
  documentId: string,
  options?: { qdrantCollection?: string }
): Promise<DocumentChunksResult> {
  try {
    const collectionName = options?.qdrantCollection || 'documents';
    const mustFilters: QdrantFilter['must'] = [
      options?.qdrantCollection
        ? documentIdentityClause(documentId)
        : { key: 'document_id', match: { value: documentId } },
    ];
    if (!options?.qdrantCollection) {
      mustFilters.unshift({ key: 'user_id', match: { value: userId } });
    }
    const filter: QdrantFilter = { must: mustFilters };

    const rawChunks = await qdrantOps.scrollDocuments(collectionName, filter, {
      limit: 1000,
      withPayload: true,
      withVector: false,
    });

    if (!rawChunks || rawChunks.length === 0) {
      return { success: false, chunks: [], chunkCount: 0, error: 'No chunks found' };
    }

    const chunks: DocumentChunkItem[] = rawChunks
      .map((chunk) => ({
        index: typeof chunk.payload.chunk_index === 'number' ? chunk.payload.chunk_index : 0,
        text: typeof chunk.payload.chunk_text === 'string' ? chunk.payload.chunk_text : '',
        tokens: typeof chunk.payload.token_count === 'number' ? chunk.payload.token_count : 0,
        pageNumber:
          typeof chunk.payload.page_number === 'number' ? chunk.payload.page_number : null,
      }))
      .filter((c) => c.text.trim().length > 0)
      .sort((a, b) => a.index - b.index);

    return { success: true, chunks, chunkCount: chunks.length };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[DocumentRetrieval] Error getting document chunks:', error);
    return { success: false, chunks: [], chunkCount: 0, error: errorMessage };
  }
}

/**
 * Ein Chunk mit seinen Nachbarn — die Quelle des Zitat-Modals.
 *
 * #3138: die Vorgängerin (als Methode an DocumentSearchService) baute
 * `user_${userId}_documents`. Diese Collection existiert nicht — weder in
 * COLLECTION_SCHEMAS (qdrantCollectionsSchema.ts:193) noch als Ziel irgendeines
 * Schreibers; vectorOperations.ts:80 upsertet Nutzerdokumente nach 'documents',
 * mit user_id, document_id und chunk_index in der Nutzlast.
 *
 * Die `user_id`-Klausel steht hier UNBEDINGT, anders als in getDocumentChunks
 * (:120-122): diese Funktion hat keinen System-Modus — dafür gibt es
 * `getSystemChunkWithContext` (DocumentSearchService.ts:765). `document_id` und
 * `user_id` sind indiziert (qdrantCollectionsSchema.ts:206, :534-539);
 * `chunk_index` ist es nicht, der Gleichheitsfilter darauf ist ein Nutzlast-Scan
 * über die bereits per document_id verengte Menge — also so teuer wie zuvor.
 *
 * Das erste Schloss ist NICHT dieser Filter, sondern die Eigentumsprüfung an
 * der Route (qdrantController.ts:371-380, `getDocumentById(documentId, userId)`).
 */
export async function getChunkWithContext(
  qdrantOps: QdrantOperations,
  userId: string,
  documentId: string,
  chunkIndex: number,
  options: { window?: number } = {}
): Promise<ChunkWithContextResult> {
  const collectionName = 'documents';
  const windowSize = options.window ?? 2;

  try {
    const filter: QdrantFilter = {
      must: [
        { key: 'user_id', match: { value: userId } },
        { key: 'document_id', match: { value: documentId } },
        { key: 'chunk_index', match: { value: chunkIndex } },
      ],
    };

    const scrollResult = await qdrantOps.scrollDocuments(collectionName, filter, {
      limit: 1,
      withPayload: true,
    });

    if (!scrollResult || scrollResult.length === 0) {
      return { success: false, error: 'Chunk not found' };
    }

    const centerPoint = scrollResult[0];

    // Die Nachbarn kommen aus contextRetrieval.ts:53-62 und hängen dort am
    // document_id des Mittelpunkts plus einem chunk_index-Bereich — aus der
    // geteilten Collection kann also kein fremdes Dokument hereinkommen.
    const contextResult = await qdrantOps.getChunkWithContext(
      collectionName,
      { id: centerPoint.id, payload: centerPoint.payload },
      { window: windowSize }
    );

    if (!contextResult.center) {
      return { success: false, error: 'Failed to retrieve context' };
    }

    const centerChunk = {
      text: (contextResult.center.payload.chunk_text as string) || '',
      chunkIndex: (contextResult.center.payload.chunk_index as number) ?? chunkIndex,
    };

    const contextChunks: ChunkContextItem[] = contextResult.context.map((chunk) => ({
      text: (chunk.payload.chunk_text as string) || '',
      chunkIndex: (chunk.payload.chunk_index as number) ?? 0,
      isCenter: chunk.id === contextResult.center?.id,
    }));

    return { success: true, centerChunk, contextChunks };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[DocumentRetrieval] Error getting chunk with context:', error);
    return { success: false, error: message };
  }
}

/** Eine Scroll-Seite; klein genug für Qdrant, gross genug für wenige Runden. */
const INSPECT_SCROLL_PAGE_SIZE = 256;
/** Deckel gegen ein Dokument mit absurd vielen Punkten (256 * 40 = 10 240). */
const INSPECT_MAX_SCROLL_PAGES = 40;

function readVectorPresence(raw: unknown): {
  embeddingPresent: boolean;
  sparsePresent: boolean;
} {
  // `scrollDocuments` castet auf `number[]` (batchOperations.ts:217). Bei
  // benannten Vektoren ist der Laufzeitwert aber `{ '': [...], bm25: {...} }`
  // (withBm25Vector, batchOperations.ts:78-81) — deshalb hier über `unknown`
  // lesen statt dem deklarierten Typ zu glauben.
  if (Array.isArray(raw)) return { embeddingPresent: raw.length > 0, sparsePresent: false };
  if (raw !== null && typeof raw === 'object') {
    const named = raw as Record<string, unknown>;
    const dense = named[''];
    return {
      embeddingPresent: Array.isArray(dense) && dense.length > 0,
      sparsePresent: Object.keys(named).some((key) => key !== '' && named[key] != null),
    };
  }
  return { embeddingPresent: false, sparsePresent: false };
}

/** Zwei Zeilen mit je zwei oder mehr `|` — die Signatur einer Markdown-Tabelle. */
function detectTable(text: string): boolean {
  let rows = 0;
  for (const line of text.split('\n')) {
    if ((line.match(/\|/g)?.length ?? 0) >= 2) {
      rows += 1;
      if (rows >= 2) return true;
    }
  }
  return false;
}

function toInspectedChunk(point: ScrollPoint): InspectedChunkRow {
  const payload = point.payload;
  const text = typeof payload.chunk_text === 'string' ? payload.chunk_text : '';
  const { embeddingPresent, sparsePresent } = readVectorPresence(point.vector as unknown);
  return {
    index: typeof payload.chunk_index === 'number' ? payload.chunk_index : 0,
    page: typeof payload.page_number === 'number' ? payload.page_number : null,
    text,
    charCount: text.length,
    tokenCount: typeof payload.token_count === 'number' ? payload.token_count : null,
    // Kein Rückfall auf 1.0 wie in searchWithQuality (vectorSearch.ts:144):
    // dort ist es eine Ranking-Entscheidung, hier wäre es eine Lüge.
    qualityScore: typeof payload.quality_score === 'number' ? payload.quality_score : null,
    hasTable: detectTable(text),
    embeddingPresent,
    sparsePresent,
  };
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Die Chunks eines Dokuments, wie sie im Punkt liegen — für den Admin-Inspektor.
 *
 * Unterschiede zu `getDocumentChunks` (jeder mit Grund, siehe Plan Task 2):
 * kein `user_id`-Filter, seitenweise statt `limit: 1000`, und `hasTable` wird
 * am Text erkannt statt aus der Nutzlast gelesen.
 *
 * Der Zähl-/Sortierdurchlauf holt bewusst KEINE Vektoren (`withVector: false`)
 * — ein Dokument kann tausende Punkte haben, und jeder Vektor kostet hier
 * ~8 KB, nur um am Ende auf 50 sichtbare Zeilen geschnitten zu werden. Ein
 * zweiter, gezielter Abruf per Punkt-ID (`client.retrieve`, wie
 * `contextRetrieval.ts:28`) holt Vektoren ausschliesslich für die sichtbare
 * Seite.
 */
export async function inspectDocumentChunks(
  qdrantOps: QdrantOperations,
  documentId: string,
  qdrantCollection: string,
  options: { offset: number; limit: number }
): Promise<InspectDocumentChunksResult> {
  try {
    const filter: QdrantFilter = {
      must: [documentIdentityClause(documentId)],
    };

    const points: ScrollPoint[] = [];
    let cursor: string | number | null = null;

    for (let page = 0; page < INSPECT_MAX_SCROLL_PAGES; page++) {
      const batch = await qdrantOps.scrollDocuments(qdrantCollection, filter, {
        limit: INSPECT_SCROLL_PAGE_SIZE,
        withPayload: true,
        withVector: false,
        offset: cursor,
      });
      // Qdrants Scroll-Offset ist eine Punkt-ID und inklusiv: der Cursor-Punkt
      // kommt als erstes Element der nächsten Seite noch einmal.
      // Gleiche Behandlung wie NotebookQdrantHelper.ts:615-617.
      const fresh = cursor === null ? batch : batch.filter((p) => p.id !== cursor);
      points.push(...fresh);
      if (batch.length < INSPECT_SCROLL_PAGE_SIZE) break;
      cursor = batch[batch.length - 1].id;
    }

    if (points.length === 0) {
      return {
        success: false,
        chunks: [],
        chunkCount: 0,
        nextOffset: null,
        payload: null,
        error: 'No chunks found',
      };
    }

    // `chunk_index` ist nirgends indiziert (qdrantCollectionsSchema.ts:205-208),
    // ein range-Filter wäre ein Nutzlast-Scan. Deshalb im Speicher sortieren —
    // genau wie getDocumentChunks es schon tut.
    const sortedPoints = points.slice().sort((a, b) => {
      const indexA = typeof a.payload.chunk_index === 'number' ? a.payload.chunk_index : 0;
      const indexB = typeof b.payload.chunk_index === 'number' ? b.payload.chunk_index : 0;
      return indexA - indexB;
    });

    const first = sortedPoints[0];
    const maxPage = sortedPoints.reduce<number | null>((acc, point) => {
      const page = typeof point.payload.page_number === 'number' ? point.payload.page_number : null;
      return page === null ? acc : Math.max(acc ?? page, page);
    }, null);
    const payload: InspectedPayloadSummary = {
      title: str(first.payload.title),
      filename: str(first.payload.filename),
      sourceUrl: str(first.payload.source_url),
      sourceType: str(first.payload.source_type),
      extractionMethod: str(first.payload.extraction_method),
      createdAt: str(first.payload.created_at),
      maxPage,
    };

    const slicePoints = sortedPoints.slice(options.offset, options.offset + options.limit);

    // Vektoren nur für die sichtbare Seite holen, per Punkt-ID — nicht für
    // die restlichen (ggf. tausenden) Punkte des Dokuments.
    const sliceIds = slicePoints.map((p) => p.id);
    const slicedVectors =
      sliceIds.length > 0
        ? await qdrantOps.client.retrieve(qdrantCollection, {
            ids: sliceIds,
            with_payload: false,
            with_vector: true,
          })
        : [];
    const vectorById = new Map<string | number, unknown>(
      slicedVectors.map((point) => [point.id, point.vector])
    );

    const slice: InspectedChunkRow[] = slicePoints.map((point) =>
      toInspectedChunk({
        ...point,
        vector: (vectorById.get(point.id) ?? null) as ScrollPoint['vector'],
      })
    );
    const next = options.offset + options.limit;

    return {
      success: true,
      chunks: slice,
      chunkCount: sortedPoints.length,
      nextOffset: next < sortedPoints.length ? next : null,
      payload,
      error: null,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[DocumentRetrieval] Error inspecting document chunks:', error);
    return {
      success: false,
      chunks: [],
      chunkCount: 0,
      nextOffset: null,
      payload: null,
      error: errorMessage,
    };
  }
}

/**
 * Get full text for multiple documents in bulk (optimized)
 *
 * More efficient than individual calls by:
 * 1. Fetching all chunks in a single query
 * 2. Grouping chunks by document_id
 * 3. Reconstructing each document in parallel
 *
 * @param qdrantOps - QdrantOperations instance
 * @param userId - User ID who owns the documents
 * @param documentIds - Array of document IDs to retrieve
 * @returns Bulk retrieval result with documents and errors
 */
export async function getMultipleDocumentsFullText(
  qdrantOps: QdrantOperations,
  userId: string,
  documentIds: string[]
): Promise<BulkDocumentResult> {
  try {
    if (!documentIds || documentIds.length === 0) {
      return { documents: [], errors: [] };
    }

    console.log(
      `[DocumentRetrieval] Bulk retrieving full text for ${documentIds.length} documents`
    );

    const filter: QdrantFilter = {
      must: [
        { key: 'user_id', match: { value: userId } },
        { key: 'document_id', match: { any: documentIds } },
      ],
    };

    const chunks = await qdrantOps.scrollDocuments('documents', filter, {
      limit: documentIds.length * 20,
      withPayload: true,
      withVector: false,
    });

    if (!chunks || chunks.length === 0) {
      return {
        documents: [],
        errors: documentIds.map((id) => ({ documentId: id, error: 'No chunks found' })),
      };
    }

    const chunksByDocument = new Map<string, QdrantDocument[]>();
    chunks.forEach((chunk) => {
      const docId = chunk.payload.document_id;
      if (typeof docId === 'string') {
        if (!chunksByDocument.has(docId)) {
          chunksByDocument.set(docId, []);
        }
        chunksByDocument.get(docId)!.push(chunk);
      }
    });

    const documents: BulkDocumentData[] = [];
    const errors: BulkDocumentError[] = [];

    documentIds.forEach((docId) => {
      const docChunks = chunksByDocument.get(docId);

      if (!docChunks || docChunks.length === 0) {
        errors.push({ documentId: docId, error: 'No chunks found for document' });
        return;
      }

      const sortedChunks = docChunks
        .sort((a, b) => {
          const indexA = typeof a.payload.chunk_index === 'number' ? a.payload.chunk_index : 0;
          const indexB = typeof b.payload.chunk_index === 'number' ? b.payload.chunk_index : 0;
          return indexA - indexB;
        })
        .map((chunk) => {
          const text = chunk.payload.chunk_text;
          return typeof text === 'string' ? text : '';
        })
        .filter((text) => text.trim().length > 0);

      const fullText = sortedChunks.join('\n\n');

      documents.push({
        id: docId,
        fullText: fullText,
        chunkCount: sortedChunks.length,
        totalCharsReconstructed: fullText.length,
      });
    });

    console.log(
      `[DocumentRetrieval] Bulk reconstruction complete: ${documents.length} documents, ${errors.length} errors`
    );

    return {
      documents,
      errors,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[DocumentRetrieval] Error in bulk document retrieval:', error);
    return {
      documents: [],
      errors: documentIds.map((id) => ({ documentId: id, error: errorMessage })),
    };
  }
}

/**
 * Get first chunks for multiple documents for previews
 *
 * Efficiently retrieves the first chunk (chunk_index = 0) for each document
 * to generate previews or summaries.
 *
 * @param qdrantOps - QdrantOperations instance
 * @param userId - User ID who owns the documents
 * @param documentIds - Array of document IDs
 * @returns Map of document ID to first chunk text
 */
export async function getDocumentFirstChunks(
  qdrantOps: QdrantOperations,
  userId: string,
  documentIds: string[]
): Promise<FirstChunksResult> {
  try {
    if (!documentIds || documentIds.length === 0) {
      return {
        success: true,
        chunks: {},
        foundCount: 0,
      };
    }

    const filter: QdrantFilter = {
      must: [
        { key: 'user_id', match: { value: userId } },
        { key: 'document_id', match: { any: documentIds } },
        { key: 'chunk_index', match: { value: 0 } },
      ],
    };

    const chunks = await qdrantOps.scrollDocuments('documents', filter, {
      limit: documentIds.length,
      withPayload: true,
      withVector: false,
    });

    const chunkMap: Record<string, string> = {};
    chunks.forEach((chunk) => {
      const docId = chunk.payload.document_id;
      const text = chunk.payload.chunk_text;
      if (typeof docId === 'string' && typeof text === 'string' && text) {
        chunkMap[docId] = text;
      }
    });

    return {
      success: true,
      chunks: chunkMap,
      foundCount: Object.keys(chunkMap).length,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[DocumentRetrieval] Error getting first chunks:', error);
    return {
      success: false,
      chunks: {},
      foundCount: 0,
      error: errorMessage,
    };
  }
}
