/**
 * System Collections Configuration
 *
 * Single source of truth for all system-level notebook collections.
 * These are pre-configured collections containing official party documents
 * that are available to all users without requiring ownership.
 */

import type { QdrantFilter } from '../database/services/QdrantService/types.js';

// =============================================================================
// Type Definitions
// =============================================================================

export interface FilterableField {
  field: string;
  label: string;
  type: 'keyword';
}

export interface DefaultFilter {
  field: string;
  value: string | string[];
}

export interface SystemCollectionConfig {
  id: string;
  qdrantCollection: string;
  name: string;
  description: string;
  minQuality: number;
  recallLimit: number;
  filterableFields: FilterableField[];
  defaultFilter?: DefaultFilter; // Auto-applied filter for this collection view
}

export interface SearchParams {
  limit: number;
  threshold: number;
  recallLimit: number;
  vectorWeight: number;
  textWeight: number;
  mode: 'hybrid';
  qualityMin?: number;
}

export interface SubcategoryFilters {
  primary_category?: string | string[];
  content_type?: string | string[];
  subcategories?: string | string[];
  country?: string | string[];
  region?: string | string[];
  date_from?: string;
  date_to?: string;
}

export interface SystemCollectionObject {
  id: string;
  user_id: 'SYSTEM';
  name: string;
  description: string;
  settings: {
    system_collection: true;
    min_quality: number;
  };
}

// =============================================================================
// Default Search Parameters
// =============================================================================

export const DEFAULT_SEARCH_PARAMS: SearchParams = {
  limit: 30,
  threshold: 0.35,
  recallLimit: 50,
  vectorWeight: 0.7,
  textWeight: 0.3,
  mode: 'hybrid',
};

// =============================================================================
// System Collections
// =============================================================================

export const SYSTEM_COLLECTIONS: Record<string, SystemCollectionConfig> = {
  'grundsatz-system': {
    id: 'grundsatz-system',
    qdrantCollection: 'grundsatz_documents',
    name: 'Grüne Grundsatzprogramme',
    description: 'Grundsatzprogramm 2020, EU-Wahlprogramm 2024, Regierungsprogramm 2025',
    minQuality: 0.3,
    recallLimit: 60,
    filterableFields: [{ field: 'primary_category', label: 'Programm', type: 'keyword' }],
  },
  'bundestagsfraktion-system': {
    id: 'bundestagsfraktion-system',
    qdrantCollection: 'bundestag_content',
    name: 'Grüne Bundestagsfraktion',
    description: 'Fachtexte, Ziele und Positionen von gruene-bundestag.de',
    minQuality: 0.3,
    recallLimit: 60,
    filterableFields: [
      { field: 'primary_category', label: 'Bereich', type: 'keyword' },
      { field: 'country', label: 'Land', type: 'keyword' },
    ],
  },
  'oesterreich-gruene-system': {
    id: 'oesterreich-gruene-system',
    qdrantCollection: 'oesterreich_gruene_documents',
    name: 'Die Grünen Österreich',
    description: 'Programme der Grünen – Die Grüne Alternative Österreich',
    minQuality: 0.3,
    recallLimit: 60,
    filterableFields: [{ field: 'primary_category', label: 'Programm', type: 'keyword' }],
  },
  'gruene-de-system': {
    id: 'gruene-de-system',
    qdrantCollection: 'gruene_de_documents',
    name: 'Grüne Deutschland (gruene.de)',
    description: 'Inhalte von gruene.de – Positionen, Themen und Aktuelles',
    minQuality: 0.3,
    recallLimit: 60,
    filterableFields: [
      { field: 'primary_category', label: 'Bereich', type: 'keyword' },
      { field: 'country', label: 'Land', type: 'keyword' },
    ],
  },
  'kommunalwiki-system': {
    id: 'kommunalwiki-system',
    qdrantCollection: 'kommunalwiki_documents',
    name: 'KommunalWiki',
    description: 'Fachwissen zur Kommunalpolitik (Heinrich-Böll-Stiftung)',
    minQuality: 0.3,
    recallLimit: 60,
    filterableFields: [
      { field: 'content_type', label: 'Artikeltyp', type: 'keyword' },
      { field: 'primary_category', label: 'Kategorie', type: 'keyword' },
      { field: 'subcategories', label: 'Unterkategorien', type: 'keyword' },
    ],
  },
  'gruene-at-system': {
    id: 'gruene-at-system',
    qdrantCollection: 'gruene_at_documents',
    name: 'Grüne Österreich (gruene.at)',
    description: 'Inhalte von gruene.at – Positionen, Themen und Aktuelles',
    minQuality: 0.3,
    recallLimit: 60,
    filterableFields: [
      { field: 'primary_category', label: 'Bereich', type: 'keyword' },
      { field: 'country', label: 'Land', type: 'keyword' },
    ],
  },
  'boell-stiftung-system': {
    id: 'boell-stiftung-system',
    qdrantCollection: 'boell_stiftung_documents',
    name: 'Heinrich-Böll-Stiftung',
    description: 'Analysen, Dossiers und Atlanten der Heinrich-Böll-Stiftung',
    minQuality: 0.3,
    recallLimit: 60,
    filterableFields: [
      { field: 'content_type', label: 'Inhaltstyp', type: 'keyword' },
      { field: 'primary_category', label: 'Thema', type: 'keyword' },
      { field: 'subcategories', label: 'Unterkategorien', type: 'keyword' },
      { field: 'region', label: 'Region', type: 'keyword' },
    ],
  },
  'satzungen-system': {
    id: 'satzungen-system',
    qdrantCollection: 'satzungen_documents',
    name: 'Satzungen',
    description: 'Satzungen der Kreisverbände und Ortsverbände',
    minQuality: 0.3,
    recallLimit: 60,
    filterableFields: [
      { field: 'landesverband', label: 'Landesverband', type: 'keyword' },
      { field: 'gremium', label: 'Gremium', type: 'keyword' },
    ],
  },
  'hamburg-system': {
    id: 'hamburg-system',
    qdrantCollection: 'landesverbaende_documents',
    name: 'Grüne Hamburg',
    description: 'Beschlüsse und Pressemitteilungen der Grünen Hamburg',
    minQuality: 0.3,
    recallLimit: 60,
    filterableFields: [
      { field: 'content_type', label: 'Typ', type: 'keyword' },
      { field: 'primary_category', label: 'Kategorie', type: 'keyword' },
    ],
    defaultFilter: { field: 'landesverband', value: 'HH' },
  },
  'schleswig-holstein-system': {
    id: 'schleswig-holstein-system',
    qdrantCollection: 'landesverbaende_documents',
    name: 'Grüne Schleswig-Holstein',
    description: 'Wahlprogramm der Grünen Schleswig-Holstein zur Landtagswahl',
    minQuality: 0.3,
    recallLimit: 60,
    filterableFields: [{ field: 'primary_category', label: 'Programm', type: 'keyword' }],
    defaultFilter: { field: 'landesverband', value: 'SH' },
  },
  'thueringen-system': {
    id: 'thueringen-system',
    qdrantCollection: 'landesverbaende_documents',
    name: 'Grüne Thüringen',
    description: 'Beschlüsse, Wahlprogramme und Pressemitteilungen der Grünen Thüringen',
    minQuality: 0.3,
    recallLimit: 60,
    filterableFields: [
      { field: 'content_type', label: 'Typ', type: 'keyword' },
      { field: 'primary_category', label: 'Kategorie', type: 'keyword' },
    ],
    defaultFilter: { field: 'landesverband', value: ['TH', 'TH-F'] },
  },
  'bayern-system': {
    id: 'bayern-system',
    qdrantCollection: 'landesverbaende_documents',
    name: 'Grüne Bayern',
    description: 'Regierungsprogramm der Grünen Bayern zur Landtagswahl',
    minQuality: 0.3,
    recallLimit: 60,
    filterableFields: [{ field: 'primary_category', label: 'Programm', type: 'keyword' }],
    defaultFilter: { field: 'landesverband', value: 'BY' },
  },
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if a collection ID is a system collection
 */
export function isSystemCollectionId(id: string): boolean {
  return id in SYSTEM_COLLECTIONS;
}

/**
 * Check if a Qdrant collection name is a system collection
 */
export function isSystemQdrantCollection(name: string): boolean {
  return Object.values(SYSTEM_COLLECTIONS).some((c) => c.qdrantCollection === name);
}

/**
 * Get full configuration for a system collection by ID
 */
export function getSystemCollectionConfig(id: string): SystemCollectionConfig | undefined {
  return SYSTEM_COLLECTIONS[id];
}

/**
 * Get all system Qdrant collection names
 */
export function getSystemQdrantCollections(): string[] {
  return Object.values(SYSTEM_COLLECTIONS).map((c) => c.qdrantCollection);
}

/**
 * Get all system collection IDs
 */
export function getAllSystemCollectionIds(): string[] {
  return Object.keys(SYSTEM_COLLECTIONS);
}

/**
 * Build a collection object suitable for notebook graph processing
 */
export function buildSystemCollectionObject(id: string): SystemCollectionObject | null {
  const config = SYSTEM_COLLECTIONS[id];
  if (!config) return null;

  return {
    id: config.id,
    user_id: 'SYSTEM',
    name: config.name,
    description: config.description,
    settings: {
      system_collection: true,
      min_quality: config.minQuality,
    },
  };
}

/**
 * Get the default system collection IDs for multi-collection queries
 * Returns all system collections for comprehensive search
 */
export function getDefaultMultiCollectionIds(): string[] {
  return getAllSystemCollectionIds();
}

/**
 * Get filterable fields for a system collection
 */
export function getCollectionFilterableFields(id: string): FilterableField[] {
  return SYSTEM_COLLECTIONS[id]?.filterableFields || [];
}

/**
 * Get search parameters for a collection (merges defaults with collection-specific overrides)
 */
export function getSearchParams(id: string): SearchParams {
  const config = SYSTEM_COLLECTIONS[id];
  if (!config) return { ...DEFAULT_SEARCH_PARAMS };

  return {
    ...DEFAULT_SEARCH_PARAMS,
    recallLimit: config.recallLimit || DEFAULT_SEARCH_PARAMS.recallLimit,
    qualityMin: config.minQuality || DEFAULT_SEARCH_PARAMS.threshold,
  };
}

/**
 * Get the default filter for a system collection (if any)
 */
export function getCollectionDefaultFilter(id: string): DefaultFilter | undefined {
  return SYSTEM_COLLECTIONS[id]?.defaultFilter;
}

/**
 * Build Qdrant filter from subcategory filters
 * Supports both single values (string) and multi-select (array)
 * Uses unified field names: primary_category, content_type, subcategories, country, region
 * Also supports date range filtering with date_from and date_to
 */
export function buildSubcategoryFilter(
  subcategoryFilters: SubcategoryFilters | null | undefined
): QdrantFilter | undefined {
  if (!subcategoryFilters || Object.keys(subcategoryFilters).length === 0) {
    return undefined;
  }

  const must: Array<{
    key: string;
    match?: { value?: string; any?: string[] };
    range?: { gte?: string; lte?: string };
  }> = [];
  const filterKeys: (keyof SubcategoryFilters)[] = [
    'primary_category',
    'content_type',
    'subcategories',
    'country',
    'region',
  ];

  for (const key of filterKeys) {
    const filterValue = subcategoryFilters[key];
    if (!filterValue) continue;

    if (Array.isArray(filterValue) && filterValue.length > 0) {
      if (filterValue.length === 1) {
        must.push({ key, match: { value: filterValue[0] } });
      } else {
        must.push({ key, match: { any: filterValue } });
      }
    } else if (typeof filterValue === 'string') {
      must.push({ key, match: { value: filterValue } });
    }
  }

  // Handle date range filtering
  if (subcategoryFilters.date_from || subcategoryFilters.date_to) {
    const range: { gte?: string; lte?: string } = {};
    if (subcategoryFilters.date_from) range.gte = subcategoryFilters.date_from;
    if (subcategoryFilters.date_to) range.lte = subcategoryFilters.date_to;
    must.push({ key: 'published_at', range });
  }

  return must.length > 0 ? { must: must as QdrantFilter['must'] } : undefined;
}

/**
 * Apply a system collection's default filter to an existing filter
 * Merges the default filter with any user-specified filters
 */
export function applyDefaultFilter(
  collectionId: string,
  existingFilter?: QdrantFilter
): QdrantFilter | undefined {
  const defaultFilter = getCollectionDefaultFilter(collectionId);
  if (!defaultFilter) return existingFilter;

  const defaultMust: { key: string; match: { value?: string; any?: string[] } } = {
    key: defaultFilter.field,
    match: Array.isArray(defaultFilter.value)
      ? { any: defaultFilter.value }
      : { value: defaultFilter.value },
  };

  if (!existingFilter) {
    return { must: [defaultMust] as QdrantFilter['must'] };
  }

  const existingMust = existingFilter.must || [];
  return {
    ...existingFilter,
    must: [...existingMust, defaultMust] as QdrantFilter['must'],
  };
}

// =============================================================================
// Default Export
// =============================================================================

export default {
  SYSTEM_COLLECTIONS,
  DEFAULT_SEARCH_PARAMS,
  isSystemCollectionId,
  isSystemQdrantCollection,
  getSystemCollectionConfig,
  getSystemQdrantCollections,
  getAllSystemCollectionIds,
  buildSystemCollectionObject,
  getDefaultMultiCollectionIds,
  getCollectionFilterableFields,
  getSearchParams,
  getCollectionDefaultFilter,
  buildSubcategoryFilter,
  applyDefaultFilter,
};
