/**
 * Qdrant Collection Configuration Types
 *
 * Shared type definitions for vector search collections.
 */

import type { FilterableFieldName, ValueLabelsFor } from './landesverbandSources.js';

/**
 * Type of field filter (how the field should be queried)
 */
export type FilterFieldType = 'keyword' | 'text' | 'numeric' | 'boolean' | 'date_range';

/**
 * Configuration for a filterable field within a collection.
 *
 * The optional `F` generic ties the config to a specific filterable field name
 * from the `FilterableFieldName` registry, which in turn locks `valueLabels`
 * keys via `ValueLabelsFor<F>`. Default `F = FilterableFieldName` keeps the
 * shape loose enough for existing call sites; opt in to per-field narrowing
 * via `satisfies FilterFieldConfig<'source_id'>` at the declaration.
 */
export interface FilterFieldConfig<F extends FilterableFieldName = FilterableFieldName> {
  /** Human-readable label (in German) */
  label: string;
  /** How this field should be filtered */
  type: FilterFieldType;
  /** Optional mapping of field values to human-readable display names */
  valueLabels?: ValueLabelsFor<F>;
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
  /**
   * Map of filterable field names to their filter configurations.
   *
   * Mapped type `{ [F in FilterableFieldName]?: FilterFieldConfig<F> }` ensures
   * (a) only registry-known field names are accepted as keys, and (b) the value
   * at each key narrows its own `valueLabels` keys via `ValueLabelsFor<F>`.
   */
  filterableFields: { [F in FilterableFieldName]?: FilterFieldConfig<F> };
  /** Default search mode for this collection */
  defaultSearchMode?: 'hybrid' | 'vector' | 'text';
  /** Whether this collection supports person detection */
  supportsPersonDetection?: boolean;
  /** Auto-applied filter (e.g., for shared Qdrant collections like landesverbaende_documents) */
  defaultFilter?: { field: string; value: string | string[] };
  /** Country this collection belongs to (undefined = country-agnostic, included in both) */
  country?: 'DE' | 'AT';
  /** Whether to include in country-wide default searches (false = requires explicit collection param) */
  includeInDefaultSearch?: boolean;
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
  | 'examples'
  | 'hamburg'
  | 'schleswig-holstein'
  | 'thueringen'
  | 'bayern'
  | 'berlin'
  | 'mecklenburg-vorpommern'
  | 'brandenburg'
  | 'satzungen'
  | 'gruenblog';
