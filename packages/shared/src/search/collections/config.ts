/**
 * Qdrant Collection Configurations
 *
 * Centralized definition of all vector search collections.
 * Used by MCP server, API, and other services.
 */

import type { CollectionConfig, CollectionConfigMap, CollectionKey } from './types.ts';

/**
 * All available Qdrant collections for Green Party content
 */
export const COLLECTIONS: CollectionConfigMap = {
  oesterreich: {
    name: 'oesterreich_gruene_documents',
    displayName: 'Die Grünen Österreich',
    description: 'EU-Wahlprogramm, Grundsatzprogramm, Nationalratswahl-Programm',
    filterableFields: {
      primary_category: { label: 'Programm', type: 'keyword' }
    },
    defaultSearchMode: 'hybrid'
  },

  deutschland: {
    name: 'grundsatz_documents',
    displayName: 'Bündnis 90/Die Grünen',
    description: 'Grundsatzprogramm 2020, EU-Wahlprogramm 2024, Regierungsprogramm 2025',
    filterableFields: {
      primary_category: { label: 'Programm', type: 'keyword' }
    },
    defaultSearchMode: 'hybrid'
  },

  bundestagsfraktion: {
    name: 'bundestag_content',
    displayName: 'Grüne Bundestagsfraktion',
    description: 'Fachtexte, Ziele und Positionen von gruene-bundestag.de',
    filterableFields: {
      primary_category: { label: 'Bereich', type: 'keyword' },
      country: { label: 'Land', type: 'keyword' }
    },
    defaultSearchMode: 'hybrid',
    supportsPersonDetection: true
  },

  'gruene-de': {
    name: 'gruene_de_documents',
    displayName: 'Grüne Deutschland (gruene.de)',
    description: 'Inhalte von gruene.de – Positionen, Themen und Aktuelles',
    filterableFields: {
      primary_category: { label: 'Bereich', type: 'keyword' },
      country: { label: 'Land', type: 'keyword' }
    },
    defaultSearchMode: 'hybrid'
  },

  'gruene-at': {
    name: 'gruene_at_documents',
    displayName: 'Grüne Österreich (gruene.at)',
    description: 'Inhalte von gruene.at – Positionen, Themen und Aktuelles',
    filterableFields: {
      primary_category: { label: 'Bereich', type: 'keyword' },
      country: { label: 'Land', type: 'keyword' }
    },
    defaultSearchMode: 'hybrid'
  },

  kommunalwiki: {
    name: 'kommunalwiki_documents',
    displayName: 'KommunalWiki',
    description: 'Fachwissen zur Kommunalpolitik (Heinrich-Böll-Stiftung)',
    filterableFields: {
      content_type: { label: 'Artikeltyp', type: 'keyword' },
      primary_category: { label: 'Kategorie', type: 'keyword' },
      subcategories: { label: 'Unterkategorien', type: 'keyword' }
    },
    defaultSearchMode: 'hybrid'
  },

  'boell-stiftung': {
    name: 'boell_stiftung_documents',
    displayName: 'Heinrich-Böll-Stiftung',
    description: 'Analysen, Dossiers und Atlanten der Heinrich-Böll-Stiftung',
    filterableFields: {
      content_type: { label: 'Inhaltstyp', type: 'keyword' },
      primary_category: { label: 'Thema', type: 'keyword' },
      subcategories: { label: 'Unterkategorien', type: 'keyword' },
      region: { label: 'Region', type: 'keyword' }
    },
    defaultSearchMode: 'hybrid'
  },

  examples: {
    name: 'social_media_examples',
    displayName: 'Social Media Beispiele',
    description: 'Erfolgreiche Instagram- und Facebook-Posts als Inspiration für eigene Inhalte',
    filterableFields: {
      platform: { label: 'Plattform', type: 'keyword' },
      country: { label: 'Land', type: 'keyword' },
      content_type: { label: 'Inhaltstyp', type: 'keyword' }
    },
    defaultSearchMode: 'hybrid'
  }
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
  return COLLECTION_KEYS.filter(key =>
    fieldName in COLLECTIONS[key].filterableFields
  );
}
