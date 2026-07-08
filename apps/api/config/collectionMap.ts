/**
 * Chat-facing collection name → Qdrant collection + system id.
 * Derived from the canonical SYSTEM_COLLECTIONS — do not hand-maintain here.
 */

import { SYSTEM_COLLECTIONS } from './systemCollectionsConfig.js';

export interface CollectionMapping {
  qdrantCollection: string;
  systemId: string;
}

export const COLLECTION_MAP: Record<string, CollectionMapping> = Object.fromEntries(
  Object.values(SYSTEM_COLLECTIONS).map((c) => [
    c.key,
    { qdrantCollection: c.qdrantCollection, systemId: c.id },
  ])
);
