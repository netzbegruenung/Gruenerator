/**
 * Access control operations
 * Verifies user document ownership
 */

import type { DocumentRecord } from '../PostgresDocumentService/types.js';

/**
 * Verify user owns requested documents and return accessible ones
 */
export async function getAccessibleDocuments(
  postgresDocumentService: any,
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
    } catch (error: any) {
      console.warn(`[DocumentContentService] Document ${docId} not accessible:`, error.message);
    }
  }

  if (accessibleDocuments.length === 0) {
    throw new Error('No accessible documents found');
  }

  console.log(
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
