/**
 * Qdrant Collection Configuration Types
 *
 * Shared type definitions for vector search collections.
 */

/**
 * Type of field filter (how the field should be queried)
 */
export type FilterFieldType = 'keyword' | 'text' | 'numeric' | 'boolean';

/**
 * Configuration for a filterable field within a collection
 */
export interface FilterFieldConfig {
  /** Human-readable label (in German) */
  label: string;
  /** How this field should be filtered */
  type: FilterFieldType;
  /** Optional description for documentation */
  description?: string;
}

/**
 * Configuration for a Qdrant collection
 */
export interface CollectionConfig {
  /** Internal Qdrant collection name */
  name: string;
  /** User-friendly display name (in German) */
  displayName: string;
  /** Description of what this collection contains */
  description: string;
  /** Map of field names to their filter configurations */
  filterableFields: Record<string, FilterFieldConfig>;
  /** Default search mode for this collection */
  defaultSearchMode?: 'hybrid' | 'vector' | 'text';
  /** Whether this collection supports person detection */
  supportsPersonDetection?: boolean;
}

/**
 * Map of collection keys to their configurations
 */
export type CollectionConfigMap = Record<string, CollectionConfig>;

/**
 * Valid collection keys
 */
export type CollectionKey =
  | 'oesterreich'
  | 'deutschland'
  | 'bundestagsfraktion'
  | 'gruene-de'
  | 'gruene-at'
  | 'kommunalwiki'
  | 'boell-stiftung'
  | 'examples';
