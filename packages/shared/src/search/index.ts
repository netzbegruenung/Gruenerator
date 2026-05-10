/**
 * Search Module
 * Platform-agnostic search functionality for web, deep research, and vector search
 */

// Web search types and hooks
export * from './types.js';
export * from './hooks/index.js';
export * from './utils/index.js';

// Vector search infrastructure (for API and MCP)
export * as vector from './vector/index.js';

// Collection configurations
export * as collections from './collections/index.js';

// Landesverband typed registries — flat re-export so consumers can
// `import { LandesverbandSourceId } from '@gruenerator/shared/search'`
// without the `collections.` namespace prefix.
export {
  LANDESVERBAND_SOURCE_IDS,
  CURATED_LIST_IDS,
  LANDESVERBAND_CONTENT_TYPES,
  LANDESVERBAND_SOURCE_TYPES,
  LV_CONTENT_TYPE_LABELS,
  LV_SOURCE_TYPE_LABELS,
  FILTERABLE_FIELD_NAMES,
  type LandesverbandSourceId,
  type CuratedListId,
  type LandesverbandContentType,
  type LandesverbandSourceType,
  type FilterableFieldName,
  type ValueLabelsFor,
} from './collections/landesverbandSources.js';

// Filter builder utilities
export * as filters from './filters/index.js';
