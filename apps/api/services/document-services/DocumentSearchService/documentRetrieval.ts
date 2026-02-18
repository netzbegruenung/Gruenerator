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
  BulkDocumentResult,
  BulkDocumentData,
  BulkDocumentError,
  FirstChunksResult,
  QdrantFilter,
  QdrantDocument,
} from './types.js';
import type { QdrantOperations } from '../../../database/services/QdrantOperations.js';

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
