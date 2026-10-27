import { describe, expect, it } from 'vitest';

import { COLLECTION_SCHEMAS } from './qdrantCollectionsSchema.js';
import { qdrantStoreOf } from './qdrantStores.js';
import { getSystemQdrantCollections } from './systemCollectionsConfig.js';

const INSTANCE_COLLECTIONS = [
  'documents',
  'user_knowledge',
  'custom_prompts',
  'user_templates',
  'user_texts',
  'notebook_collections',
  'notebook_collection_documents',
  'notebook_public_access',
  'user_memories',
  'chat_thread_recall',
];

describe('qdrantStores', () => {
  it('every schema entry declares a store', () => {
    for (const schema of Object.values(COLLECTION_SCHEMAS)) {
      expect(['content', 'instance'], schema.name).toContain(schema.store);
    }
  });

  it('every system collection is content', () => {
    for (const name of getSystemQdrantCollections()) {
      expect(qdrantStoreOf(name), name).toBe('content');
    }
  });

  it('instance collections are exactly the user stores', () => {
    const instance = Object.values(COLLECTION_SCHEMAS)
      .filter((schema) => schema.store === 'instance')
      .map((schema) => schema.name)
      .sort();
    expect(instance).toEqual([...INSTANCE_COLLECTIONS].sort());
  });

  it('unknown names are instance', () => {
    expect(qdrantStoreOf('does_not_exist')).toBe('instance');
  });
});
