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
  CollectionKey,
} from './types.js';

// Landesverband typed registries — source IDs, curated lists, content types, source types
export {
  LANDESVERBAND_SOURCE_IDS,
  CURATED_LIST_IDS,
  LANDESVERBAND_CONTENT_TYPES,
  LANDESVERBAND_SOURCE_TYPES,
  LV_CONTENT_TYPE_LABELS,
  LV_SOURCE_TYPE_LABELS,
  type LandesverbandSourceId,
  type CuratedListId,
  type LandesverbandContentType,
  type LandesverbandSourceType,
} from './landesverbandSources.js';

// Config and utilities
export {
  COLLECTIONS,
  COLLECTION_KEYS,
  getCollection,
  getQdrantCollectionName,
  isValidCollectionKey,
  getFilterableFields,
  getCollectionsWithField,
  getDefaultSearchCollections,
  buildCollectionDefaultFilter,
} from './config.js';
