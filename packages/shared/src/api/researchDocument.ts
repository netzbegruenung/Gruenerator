import { getContractsClient } from './contractsClient.js';
import { ApiError } from './errors.js';

import type { ResearchDocumentResponse } from '@gruenerator/contracts';

export interface ResearchDocumentParams {
  collectionId: string;
  sourceUrl: string;
  /** The search the document was opened from — marks its passages. */
  query: string;
}

/** One key for web and mobile, so both cache the reader alike. */
export function researchDocumentQueryKey({
  collectionId,
  sourceUrl,
  query,
}: ResearchDocumentParams) {
  return ['research-document', collectionId, sourceUrl, query.trim()] as const;
}

/** A system-collection document, split for the notebook reader. */
export async function fetchResearchDocument({
  collectionId,
  sourceUrl,
  query,
}: ResearchDocumentParams): Promise<ResearchDocumentResponse> {
  const result = await getContractsClient().research.document({
    query: { collectionId, sourceUrl, query: query.trim() || null },
  });
  if (result.status !== 200) {
    throw new ApiError(result.status, `Dokument nicht geladen (HTTP ${result.status})`);
  }
  return result.body;
}
