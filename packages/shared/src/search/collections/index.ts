/**
 * Collection Configuration Module
 *
 * Exports collection configurations and utilities for Qdrant vector search.
 */

// Types
export type {
  FilterFieldType,
  FilterFieldConfig,
  CollectionConfig,
  CollectionConfigMap,
  CollectionKey
} from './types.ts';

// Config and utilities
export {
  COLLECTIONS,
  COLLECTION_KEYS,
  getCollection,
  getQdrantCollectionName,
  isValidCollectionKey,
  getFilterableFields,
  getCollectionsWithField
} from './config.ts';
