/**
 * Qdrant Collection Configurations
 *
 * Centralized definition of all vector search collections.
 * Used by MCP server, API, and other services.
 */

import type { CollectionConfig, CollectionConfigMap, CollectionKey } from './types.js';
import type { QdrantFilter } from '../filters/types.js';

/**
 * All available Qdrant collections for Green Party content
 */
export const COLLECTIONS: CollectionConfigMap = {
  oesterreich: {
    name: 'oesterreich_gruene_documents',
    displayName: 'Die Grünen Österreich',
    description: 'EU-Wahlprogramm, Grundsatzprogramm, Nationalratswahl-Programm',
    filterableFields: {
      primary_category: { label: 'Programm', type: 'keyword' },
    },
    defaultSearchMode: 'hybrid',
    country: 'AT',
    includeInDefaultSearch: true,
  },

  deutschland: {
    name: 'grundsatz_documents',
    displayName: 'Bündnis 90/Die Grünen',
    description: 'Grundsatzprogramm 2020, EU-Wahlprogramm 2024, Regierungsprogramm 2025',
    filterableFields: {
      primary_category: { label: 'Programm', type: 'keyword' },
    },
    defaultSearchMode: 'hybrid',
    country: 'DE',
    includeInDefaultSearch: true,
  },

  bundestagsfraktion: {
    name: 'bundestag_content',
    displayName: 'Grüne Bundestagsfraktion',
    description: 'Fachtexte, Ziele und Positionen von gruene-bundestag.de',
    filterableFields: {
      primary_category: { label: 'Bereich', type: 'keyword' },
      country: { label: 'Land', type: 'keyword' },
    },
    defaultSearchMode: 'hybrid',
    supportsPersonDetection: true,
    country: 'DE',
    includeInDefaultSearch: true,
  },

  'gruene-de': {
    name: 'gruene_de_documents',
    displayName: 'Grüne Deutschland (gruene.de)',
    description: 'Inhalte von gruene.de – Positionen, Themen und Aktuelles',
    filterableFields: {
      primary_category: { label: 'Bereich', type: 'keyword' },
      country: { label: 'Land', type: 'keyword' },
    },
    defaultSearchMode: 'hybrid',
    country: 'DE',
    includeInDefaultSearch: true,
  },

  'gruene-at': {
    name: 'gruene_at_documents',
    displayName: 'Grüne Österreich (gruene.at)',
    description: 'Inhalte von gruene.at – Positionen, Themen und Aktuelles',
    filterableFields: {
      primary_category: { label: 'Bereich', type: 'keyword' },
      country: { label: 'Land', type: 'keyword' },
    },
    defaultSearchMode: 'hybrid',
    country: 'AT',
    includeInDefaultSearch: true,
  },

  kommunalwiki: {
    name: 'kommunalwiki_documents',
    displayName: 'KommunalWiki',
    description: 'Fachwissen zur Kommunalpolitik (Heinrich-Böll-Stiftung)',
    filterableFields: {
      content_type: { label: 'Artikeltyp', type: 'keyword' },
      primary_category: { label: 'Kategorie', type: 'keyword' },
      subcategories: { label: 'Unterkategorien', type: 'keyword' },
    },
    defaultSearchMode: 'hybrid',
    includeInDefaultSearch: true,
  },

  'boell-stiftung': {
    name: 'boell_stiftung_documents',
    displayName: 'Heinrich-Böll-Stiftung',
    description: 'Analysen, Dossiers und Atlanten der Heinrich-Böll-Stiftung',
    filterableFields: {
      content_type: { label: 'Inhaltstyp', type: 'keyword' },
      primary_category: { label: 'Thema', type: 'keyword' },
      subcategories: { label: 'Unterkategorien', type: 'keyword' },
      region: { label: 'Region', type: 'keyword' },
    },
    defaultSearchMode: 'hybrid',
    includeInDefaultSearch: true,
  },

  examples: {
    name: 'social_media_examples',
    displayName: 'Social Media Beispiele',
    description: 'Erfolgreiche Instagram- und Facebook-Posts als Inspiration für eigene Inhalte',
    filterableFields: {
      platform: { label: 'Plattform', type: 'keyword' },
      country: { label: 'Land', type: 'keyword' },
      content_type: { label: 'Inhaltstyp', type: 'keyword' },
    },
    defaultSearchMode: 'hybrid',
    includeInDefaultSearch: false,
  },

  hamburg: {
    name: 'landesverbaende_documents',
    displayName: 'Grüne Hamburg',
    description: 'Beschlüsse und Pressemitteilungen der Grünen Hamburg',
    filterableFields: {
      content_type: { label: 'Typ', type: 'keyword' },
      primary_category: { label: 'Kategorie', type: 'keyword' },
    },
    defaultSearchMode: 'hybrid',
    defaultFilter: { field: 'landesverband', value: 'HH' },
    country: 'DE',
    includeInDefaultSearch: false,
  },

  'schleswig-holstein': {
    name: 'landesverbaende_documents',
    displayName: 'Grüne Schleswig-Holstein',
    description: 'Wahlprogramm der Grünen Schleswig-Holstein zur Landtagswahl',
    filterableFields: {
      primary_category: { label: 'Programm', type: 'keyword' },
    },
    defaultSearchMode: 'hybrid',
    defaultFilter: { field: 'landesverband', value: 'SH' },
    country: 'DE',
    includeInDefaultSearch: false,
  },

  thueringen: {
    name: 'landesverbaende_documents',
    displayName: 'Grüne Thüringen',
    description: 'Beschlüsse, Wahlprogramme und Pressemitteilungen der Grünen Thüringen',
    filterableFields: {
      content_type: { label: 'Typ', type: 'keyword' },
      primary_category: { label: 'Kategorie', type: 'keyword' },
    },
    defaultSearchMode: 'hybrid',
    defaultFilter: { field: 'landesverband', value: ['TH', 'TH-F'] },
    country: 'DE',
    includeInDefaultSearch: false,
  },

  bayern: {
    name: 'landesverbaende_documents',
    displayName: 'Grüne Bayern',
    description: 'Regierungsprogramm der Grünen Bayern zur Landtagswahl',
    filterableFields: {
      primary_category: { label: 'Programm', type: 'keyword' },
    },
    defaultSearchMode: 'hybrid',
    defaultFilter: { field: 'landesverband', value: 'BY' },
    country: 'DE',
    includeInDefaultSearch: false,
  },

  berlin: {
    name: 'landesverbaende_documents',
    displayName: 'Grüne Berlin',
    description: 'Pressemitteilungen und Beschlüsse der Grünen Berlin',
    filterableFields: {
      content_type: { label: 'Typ', type: 'keyword' },
      primary_category: { label: 'Kategorie', type: 'keyword' },
    },
    defaultSearchMode: 'hybrid',
    defaultFilter: { field: 'landesverband', value: 'BE' },
    country: 'DE',
    includeInDefaultSearch: false,
  },
};

/**
 * List of all valid collection keys
 */
export const COLLECTION_KEYS: CollectionKey[] = Object.keys(COLLECTIONS) as CollectionKey[];

/**
 * Get collection config by key
 * @param key - Collection key
 * @returns Collection config or undefined if not found
 */
export function getCollection(key: string): CollectionConfig | undefined {
  return COLLECTIONS[key];
}

/**
 * Get Qdrant collection name from key
 * @param key - Collection key (e.g., 'deutschland')
 * @returns Qdrant collection name (e.g., 'grundsatz_documents')
 */
export function getQdrantCollectionName(key: string): string | undefined {
  return COLLECTIONS[key]?.name;
}

/**
 * Check if a collection key is valid
 * @param key - Collection key to check
 * @returns True if valid
 */
export function isValidCollectionKey(key: string): key is CollectionKey {
  return key in COLLECTIONS;
}

/**
 * Get all filterable field names for a collection
 * @param key - Collection key
 * @returns Array of field names
 */
export function getFilterableFields(key: string): string[] {
  const collection = COLLECTIONS[key];
  return collection ? Object.keys(collection.filterableFields) : [];
}

/**
 * Get collections that support a specific filter field
 * @param fieldName - Filter field name (e.g., 'platform')
 * @returns Array of collection keys
 */
export function getCollectionsWithField(fieldName: string): CollectionKey[] {
  return COLLECTION_KEYS.filter((key) => fieldName in COLLECTIONS[key].filterableFields);
}

/**
 * Get default search collection keys for a country.
 * Returns collections that have `includeInDefaultSearch: true` and either
 * match the given country or are country-agnostic (no country set).
 *
 * @param country - 'DE' or 'AT'
 * @returns Array of collection keys for default country-wide search
 */
export function getDefaultSearchCollections(country: 'DE' | 'AT'): CollectionKey[] {
  return COLLECTION_KEYS.filter((key) => {
    const col = COLLECTIONS[key];
    if (!col.includeInDefaultSearch) return false;
    if (!col.country) return true;
    return col.country === country;
  });
}

/**
 * Build a Qdrant filter from a collection's `defaultFilter` config.
 * Used for shared Qdrant collections (e.g., landesverbaende_documents)
 * where multiple logical collections map to one physical collection.
 *
 * @param key - Collection key (e.g., 'hamburg')
 * @returns QdrantFilter with a must condition, or null if no defaultFilter
 */
export function buildCollectionDefaultFilter(key: string): QdrantFilter | null {
  const col = COLLECTIONS[key];
  if (!col?.defaultFilter) return null;

  const { field, value } = col.defaultFilter;
  if (Array.isArray(value)) {
    return { must: [{ key: field, match: { any: value } }] };
  }
  return { must: [{ key: field, match: { value } }] };
}
