/**
 * Chat-facing collection name → Qdrant collection + system id.
 * Derived from the canonical SYSTEM_COLLECTIONS — do not hand-maintain here.
 */

import { type RemoteSourceId } from '../services/notebook/remoteSources/ids.js';

import { SYSTEM_COLLECTIONS, isRemoteCollection } from './systemCollectionsConfig.js';

/** `remoteSource` statt `qdrantCollection`: siehe `RemoteSystemCollectionConfig`. */
export type CollectionMapping = { systemId: string } & (
  { qdrantCollection: string } | { remoteSource: RemoteSourceId }
);

export const COLLECTION_MAP: Record<string, CollectionMapping> = Object.fromEntries(
  Object.values(SYSTEM_COLLECTIONS).map((c): [string, CollectionMapping] => [
    c.key,
    isRemoteCollection(c)
      ? { remoteSource: c.remote, systemId: c.id }
      : { qdrantCollection: c.qdrantCollection, systemId: c.id },
  ])
);
