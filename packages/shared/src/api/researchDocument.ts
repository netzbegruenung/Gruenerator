import { getContractsClient } from './contractsClient.js';
import { ApiError } from './errors.js';

import type { ResearchDocumentResponse } from '@gruenerator/contracts';

/** A system-collection document, found by its URL. */
interface SystemDocumentParams {
  collectionId: string;
  sourceUrl: string;
  /** The search the document was opened from — marks its passages. */
  query: string;
}

/** A user's own document. `notebookId` is the notebook it was cited from —
 *  members of a shared notebook read through it. */
interface UserDocumentParams {
  documentId: string;
  notebookId: string | null;
  query: string;
}

export type ResearchDocumentParams = SystemDocumentParams | UserDocumentParams;

/** One key for web and mobile, so both cache the reader alike. */
export function researchDocumentQueryKey(params: ResearchDocumentParams) {
  const [scope, id] =
    'documentId' in params
      ? [params.notebookId, params.documentId]
      : [params.collectionId, params.sourceUrl];
  return ['research-document', scope, id, params.query.trim()] as const;
}

/** A document, split for the notebook reader. */
export async function fetchResearchDocument(
  params: ResearchDocumentParams
): Promise<ResearchDocumentResponse> {
  const query = params.query.trim() || null;
  const result =
    'documentId' in params
      ? await getContractsClient().documents.getReader({
          params: { id: params.documentId },
          query: { notebookId: params.notebookId, query },
        })
      : await getContractsClient().research.document({
          query: { collectionId: params.collectionId, sourceUrl: params.sourceUrl, query },
        });
  if (result.status !== 200) {
    throw new ApiError(result.status, `Dokument nicht geladen (HTTP ${result.status})`);
  }
  return result.body;
}
