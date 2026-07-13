/**
 * Collection type vocabulary for Qdrant vector search.
 *
 * The runtime collection registry now lives in the backend
 * (`apps/api/config/systemCollectionsConfig.ts`) as the single source of truth;
 * the MCP fetches it at runtime (`services/mcp/src/catalog.ts`). Only the shared
 * type vocabulary + Landesverband registries remain here.
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
  FILTERABLE_FIELD_NAMES,
  type LandesverbandSourceId,
  type CuratedListId,
  type LandesverbandContentType,
  type LandesverbandSourceType,
  type FilterableFieldName,
  type ValueLabelsFor,
} from './landesverbandSources.js';
