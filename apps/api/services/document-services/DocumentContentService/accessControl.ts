/**
 * Access control operations
 * Verifies user document ownership
 */

import { createLogger } from '../../../utils/logger.js';

import type { DocumentRecord } from '../PostgresDocumentService/types.js';

const log = createLogger('accessControl');

/**
 * Verify user owns requested documents and return accessible ones
 */
export async function getAccessibleDocuments(
  postgresDocumentService: {
    getDocumentById: (docId: string, userId: string) => Promise<DocumentRecord | null>;
  },
  userId: string,
  documentIds: string[]
): Promise<DocumentRecord[]> {
  const accessibleDocuments: DocumentRecord[] = [];

  for (const docId of documentIds) {
    try {
      const doc = await postgresDocumentService.getDocumentById(docId, userId);
      if (doc) {
        accessibleDocuments.push(doc);
      }
    } catch (error: unknown) {
      log.warn(
        '[DocumentContentService] Document %s not accessible: %s',
        docId.replace(/%/g, '%%'),
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  if (accessibleDocuments.length === 0) {
    throw new Error('No accessible documents found');
  }

  log.debug(
    `[DocumentContentService] User has access to ${accessibleDocuments.length}/${documentIds.length} documents`
  );

  return accessibleDocuments;
}

/**
 * Extract accessible document IDs from document records
 */
export function getAccessibleDocumentIds(documents: DocumentRecord[]): string[] {
  return documents.map((doc) => doc.id);
}
