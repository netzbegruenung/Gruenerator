/**
 * Search Module
 * Platform-agnostic search functionality for web, deep research, and vector search
 */

// Web search types. The `useSearch` hook and its source-formatting helpers that
// used to be re-exported here are gone: no app mounted them any more, so they
// were 300+ lines of client code for two endpoints nothing called. The endpoints
// themselves stay — see `searchController` — because they are contracted and a
// shipped mobile binary can still reach them.
export * from './types.js';

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
