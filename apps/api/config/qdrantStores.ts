import { COLLECTION_SCHEMAS } from './qdrantCollectionsSchema.js';

export type QdrantStore = 'content' | 'instance';

const STORE_BY_COLLECTION = new Map<string, QdrantStore>(
  Object.values(COLLECTION_SCHEMAS).map((schema) => [schema.name, schema.store])
);

/** Unbekannte Namen (nicht im Schema) gelten als Instanz-Daten. */
export function qdrantStoreOf(collection: string): QdrantStore {
  return STORE_BY_COLLECTION.get(collection) ?? 'instance';
}
