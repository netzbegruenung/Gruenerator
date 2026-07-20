/**
 * System Collections Configuration
 *
 * Single source of truth for all system-level notebook collections.
 * These are pre-configured collections containing official party documents
 * that are available to all users without requiring ownership.
 */

import {
  LV_CONTENT_TYPE_LABELS,
  LV_SOURCE_TYPE_LABELS,
  type CuratedListId,
  type FilterableFieldName,
  type LandesverbandSourceId,
  type LandesverbandSourceType,
  type ValueLabelsFor,
} from '@gruenerator/shared/search';

import { TOPIC_NAMES } from '../services/monitor/types.js';

import type { QdrantFilter } from '../database/services/QdrantService/types.js';

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Filterable field declaration for a system collection.
 *
 * Field name is constrained to the `FilterableFieldName` registry (typos at
 * declaration sites fail compile). `valueLabels` keys are narrowed per-field
 * via `ValueLabelsFor<F>` — `source_id` only accepts `LandesverbandSourceId`,
 * `curated_lists` only accepts `CuratedListId`, etc. Default `F = FilterableFieldName`
 * keeps consumer iteration (`for (const field of filterableFields)`) simple:
 * the union of all branches has `valueLabels?: Record<string, string> | undefined`,
 * which property-access sites can use without manual narrowing.
 */
export interface FilterableField<F extends FilterableFieldName = FilterableFieldName> {
  field: F;
  label: string;
  type: 'keyword' | 'date_range';
  valueLabels?: ValueLabelsFor<F>;
  // Backend-only facet (themes/persons): in the notebook UI, out of the MCP catalog.
  mcpHidden?: boolean;
}

export interface DefaultFilter {
  field: string;
  value: string | string[];
}

export interface SystemCollectionConfig {
  id: string;
  // Chat-facing key (e.g. `bayern`) COLLECTION_MAP derives from; distinct from
  // the `-system` id, which is the wire contract for notebook filters + embed.
  key: string;
  qdrantCollection: string;
  name: string;
  description: string;
  minQuality: number;
  recallLimit: number;
  filterableFields: FilterableField[];
  defaultFilter?: DefaultFilter; // Auto-applied filter for this collection view
  country?: 'DE' | 'AT';
  includeInDefaultSearch?: boolean;
  mcpExposed: boolean;
  // Agent-only: never in galleries, the MCP catalog, or "search all" sweeps.
  agentOnly?: boolean;
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
  landesverband?: string | string[];
  gremium?: string | string[];
  source_id?: LandesverbandSourceId | LandesverbandSourceId[];
  source_type?: LandesverbandSourceType | LandesverbandSourceType[];
  curated_lists?: CuratedListId | CuratedListId[];
  themes?: string | string[];
  persons?: string | string[];
  // Abgeordnetenwatch notebook facets — must be applied by buildSubcategoryFilter,
  // otherwise selecting them in the notebook UI silently returns unfiltered results.
  parliament?: string | string[];
  party?: string | string[];
  income_level?: string | string[];
  gruene_vote?: string | string[];
  date_from?: string;
  date_to?: string;
}

/**
 * Keys of `SubcategoryFilters` that hold multi-value (string | string[]) match filters.
 * Excludes the date range keys. Used by `buildSubcategoryFilter` for typed iteration.
 */
const MULTI_VALUE_FILTER_KEYS = [
  'primary_category',
  'content_type',
  'subcategories',
  'country',
  'region',
  'landesverband',
  'gremium',
  'source_id',
  'source_type',
  'curated_lists',
  'themes',
  'persons',
  'parliament',
  'party',
  'income_level',
  'gruene_vote',
] as const satisfies ReadonlyArray<keyof SubcategoryFilters>;

export interface SystemCollectionObject {
  id: string;
  user_id: 'SYSTEM';
  name: string;
  description: string;
  settings: {
    system_collection: true;
    min_quality: number;
  };
  [key: string]: unknown;
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

/** Shared "Typ" filter declaration reused across every Landesverband system collection. */
const LV_CONTENT_TYPE_FIELD: FilterableField<'content_type'> = {
  field: 'content_type',
  label: 'Typ',
  type: 'keyword',
  valueLabels: LV_CONTENT_TYPE_LABELS,
};

/** Shared "Organ" filter declaration — only used by LVs that have both Landesverband and Fraktion. */
const LV_SOURCE_TYPE_FIELD: FilterableField<'source_type'> = {
  field: 'source_type',
  label: 'Organ',
  type: 'keyword',
  valueLabels: LV_SOURCE_TYPE_LABELS,
};

/**
 * NLP-enriched per-document facets, appended to every in-scope collection below.
 * `themes` maps the 13 topic categories to German labels; `persons` are raw
 * spaCy NER names (no label vocabulary). Populated by the nightly enrichment job.
 */
const THEMES_FIELD: FilterableField<'themes'> = {
  field: 'themes',
  label: 'Thema',
  type: 'keyword',
  valueLabels: TOPIC_NAMES,
  mcpHidden: true,
};

const PERSONS_FIELD: FilterableField<'persons'> = {
  field: 'persons',
  label: 'Person',
  type: 'keyword',
  mcpHidden: true,
};

export const SYSTEM_COLLECTIONS: Record<string, SystemCollectionConfig> = {
  'grundsatz-system': {
    id: 'grundsatz-system',
    key: 'deutschland',
    country: 'DE',
    includeInDefaultSearch: true,
    mcpExposed: true,
    qdrantCollection: 'grundsatz_documents',
    name: 'Grüne Grundsatzprogramme',
    description: 'Grundsatzprogramm 2020, EU-Wahlprogramm 2024, Regierungsprogramm 2025',
    minQuality: 0.3,
    recallLimit: 60,
    filterableFields: [{ field: 'primary_category', label: 'Programm', type: 'keyword' }],
  },
  'bundestagsfraktion-system': {
    id: 'bundestagsfraktion-system',
    key: 'bundestagsfraktion',
    country: 'DE',
    includeInDefaultSearch: true,
    mcpExposed: true,
    qdrantCollection: 'bundestag_content',
    name: 'Grüne Bundestagsfraktion',
    description: 'Fachtexte, Ziele und Positionen von gruene-bundestag.de',
    minQuality: 0.3,
    recallLimit: 60,
    filterableFields: [
      { field: 'primary_category', label: 'Bereich', type: 'keyword' },
      { field: 'country', label: 'Land', type: 'keyword' },
      { field: 'published_at', label: 'Datum', type: 'date_range' },
    ],
  },
  'oesterreich-gruene-system': {
    id: 'oesterreich-gruene-system',
    key: 'oesterreich',
    country: 'AT',
    includeInDefaultSearch: true,
    mcpExposed: true,
    qdrantCollection: 'oesterreich_gruene_documents',
    name: 'Die Grünen Österreich',
    description: 'Programme der Grünen – Die Grüne Alternative Österreich',
    minQuality: 0.3,
    recallLimit: 60,
    filterableFields: [{ field: 'primary_category', label: 'Programm', type: 'keyword' }],
  },
  'abgeordnetenwatch-system': {
    id: 'abgeordnetenwatch-system',
    key: 'abgeordnetenwatch',
    country: 'DE',
    includeInDefaultSearch: false,
    mcpExposed: true,
    qdrantCollection: 'abgeordnetenwatch_documents',
    name: 'Abgeordnetenwatch',
    description:
      'Namentliche Abstimmungen (mit Grünen-Votum) und Nebentätigkeiten von Abgeordneten',
    minQuality: 0.3,
    recallLimit: 60,
    filterableFields: [
      {
        field: 'content_type',
        label: 'Typ',
        type: 'keyword',
        valueLabels: { abstimmung: 'Abstimmung', nebentaetigkeit: 'Nebentätigkeit' },
      },
      { field: 'primary_category', label: 'Thema / Branche', type: 'keyword' },
      { field: 'parliament', label: 'Parlament', type: 'keyword' },
      { field: 'party', label: 'Partei', type: 'keyword' },
      {
        field: 'gruene_vote',
        label: 'Grüne-Votum',
        type: 'keyword',
        valueLabels: {
          ja: 'Ja',
          nein: 'Nein',
          enthaltung: 'Enthaltung',
          uneinheitlich: 'Uneinheitlich',
          keine: 'Keine',
        },
      },
      { field: 'income_level', label: 'Einkommensstufe', type: 'keyword' },
      { field: 'published_at', label: 'Datum', type: 'date_range' },
    ],
  },
  'gruene-de-system': {
    id: 'gruene-de-system',
    key: 'gruene-de',
    country: 'DE',
    includeInDefaultSearch: true,
    mcpExposed: true,
    qdrantCollection: 'gruene_de_documents',
    name: 'Grüne Deutschland (gruene.de)',
    description: 'Inhalte von gruene.de – Positionen, Themen und Aktuelles',
    minQuality: 0.3,
    recallLimit: 60,
    filterableFields: [
      { field: 'primary_category', label: 'Bereich', type: 'keyword' },
      { field: 'country', label: 'Land', type: 'keyword' },
      { field: 'published_at', label: 'Datum', type: 'date_range' },
    ],
  },
  'kommunalwiki-system': {
    id: 'kommunalwiki-system',
    key: 'kommunalwiki',
    includeInDefaultSearch: true,
    mcpExposed: true,
    qdrantCollection: 'kommunalwiki_documents',
    name: 'KommunalWiki',
    description: 'Fachwissen zur Kommunalpolitik (Heinrich-Böll-Stiftung)',
    minQuality: 0.3,
    recallLimit: 60,
    filterableFields: [
      { field: 'content_type', label: 'Artikeltyp', type: 'keyword' },
      { field: 'primary_category', label: 'Kategorie', type: 'keyword' },
      { field: 'subcategories', label: 'Unterkategorien', type: 'keyword' },
      { field: 'published_at', label: 'Datum', type: 'date_range' },
    ],
  },
  'gruene-at-system': {
    id: 'gruene-at-system',
    key: 'gruene-at',
    country: 'AT',
    includeInDefaultSearch: true,
    mcpExposed: true,
    qdrantCollection: 'gruene_at_documents',
    name: 'Grüne Österreich (gruene.at)',
    description: 'Inhalte von gruene.at – Positionen, Themen und Aktuelles',
    minQuality: 0.3,
    recallLimit: 60,
    filterableFields: [
      { field: 'primary_category', label: 'Bereich', type: 'keyword' },
      { field: 'country', label: 'Land', type: 'keyword' },
      { field: 'published_at', label: 'Datum', type: 'date_range' },
    ],
  },
  'gruenblog-system': {
    id: 'gruenblog-system',
    key: 'gruenblog',
    country: 'DE',
    includeInDefaultSearch: true,
    mcpExposed: true,
    qdrantCollection: 'gruenblog_documents',
    name: 'Grünblog',
    description: 'Onlinemagazin der Grünen – Artikel zu Wissen, Meinen, Machen',
    minQuality: 0.3,
    recallLimit: 60,
    filterableFields: [
      { field: 'primary_category', label: 'Kategorie', type: 'keyword' },
      { field: 'published_at', label: 'Datum', type: 'date_range' },
    ],
  },
  'boell-stiftung-system': {
    id: 'boell-stiftung-system',
    key: 'boell-stiftung',
    includeInDefaultSearch: true,
    mcpExposed: true,
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
      { field: 'published_at', label: 'Datum', type: 'date_range' },
    ],
  },
  'satzungen-system': {
    id: 'satzungen-system',
    key: 'satzungen',
    includeInDefaultSearch: false,
    // Dormant collection — hidden from the public MCP catalog (/api/v1/collections).
    mcpExposed: false,
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
    key: 'hamburg',
    country: 'DE',
    includeInDefaultSearch: false,
    mcpExposed: true,
    qdrantCollection: 'landesverbaende_documents',
    name: 'Grüne Hamburg',
    description: 'Beschlüsse und Pressemitteilungen der Grünen Hamburg',
    minQuality: 0.3,
    recallLimit: 60,
    filterableFields: [
      LV_CONTENT_TYPE_FIELD,
      { field: 'primary_category', label: 'Kategorie', type: 'keyword' },
      { field: 'subcategories', label: 'Unterkategorien', type: 'keyword' },
      { field: 'published_at', label: 'Datum', type: 'date_range' },
    ],
    defaultFilter: { field: 'landesverband', value: 'HH' },
  },
  'schleswig-holstein-system': {
    id: 'schleswig-holstein-system',
    key: 'schleswig-holstein',
    country: 'DE',
    includeInDefaultSearch: false,
    mcpExposed: true,
    qdrantCollection: 'landesverbaende_documents',
    name: 'Grüne Schleswig-Holstein',
    description: 'Wahlprogramm der Grünen Schleswig-Holstein zur Landtagswahl',
    minQuality: 0.3,
    recallLimit: 60,
    filterableFields: [
      LV_CONTENT_TYPE_FIELD,
      { field: 'primary_category', label: 'Programm', type: 'keyword' },
      { field: 'subcategories', label: 'Unterkategorien', type: 'keyword' },
      { field: 'published_at', label: 'Datum', type: 'date_range' },
    ],
    defaultFilter: { field: 'landesverband', value: 'SH' },
  },
  'thueringen-system': {
    id: 'thueringen-system',
    key: 'thueringen',
    country: 'DE',
    includeInDefaultSearch: false,
    mcpExposed: true,
    qdrantCollection: 'landesverbaende_documents',
    name: 'Grüne Thüringen',
    description: 'Beschlüsse, Wahlprogramme und Pressemitteilungen der Grünen Thüringen',
    minQuality: 0.3,
    recallLimit: 60,
    filterableFields: [
      LV_CONTENT_TYPE_FIELD,
      LV_SOURCE_TYPE_FIELD,
      { field: 'primary_category', label: 'Kategorie', type: 'keyword' },
      { field: 'subcategories', label: 'Unterkategorien', type: 'keyword' },
      { field: 'published_at', label: 'Datum', type: 'date_range' },
    ],
    defaultFilter: { field: 'landesverband', value: ['TH', 'TH-F'] },
  },
  'bayern-system': {
    id: 'bayern-system',
    key: 'bayern',
    country: 'DE',
    includeInDefaultSearch: false,
    mcpExposed: true,
    qdrantCollection: 'landesverbaende_documents',
    name: 'Grüne Bayern',
    description:
      'Pressemitteilungen, Beschlüsse und Regierungsprogramm der Grünen Bayern (Landesverband & Fraktion)',
    minQuality: 0.3,
    recallLimit: 60,
    filterableFields: [
      LV_CONTENT_TYPE_FIELD,
      LV_SOURCE_TYPE_FIELD,
      { field: 'published_at', label: 'Datum', type: 'date_range' },
    ],
    defaultFilter: { field: 'landesverband', value: ['BY', 'BY-F'] },
  },
  'berlin-system': {
    id: 'berlin-system',
    key: 'berlin',
    country: 'DE',
    includeInDefaultSearch: false,
    mcpExposed: true,
    qdrantCollection: 'landesverbaende_documents',
    name: 'Grüne Berlin',
    description: 'Pressemitteilungen und Beschlüsse der Grünen Berlin (Landesverband & Fraktion)',
    minQuality: 0.3,
    recallLimit: 60,
    filterableFields: [
      LV_CONTENT_TYPE_FIELD,
      LV_SOURCE_TYPE_FIELD,
      { field: 'published_at', label: 'Datum', type: 'date_range' },
    ],
    defaultFilter: { field: 'landesverband', value: ['BE', 'BE-F'] },
  },
  'mecklenburg-vorpommern-system': {
    id: 'mecklenburg-vorpommern-system',
    key: 'mecklenburg-vorpommern',
    country: 'DE',
    includeInDefaultSearch: false,
    mcpExposed: true,
    qdrantCollection: 'landesverbaende_documents',
    name: 'Grüne Mecklenburg-Vorpommern',
    description: 'Pressemitteilungen und Parteitagsbeschlüsse der Grünen Mecklenburg-Vorpommern',
    minQuality: 0.3,
    recallLimit: 60,
    filterableFields: [
      LV_CONTENT_TYPE_FIELD,
      LV_SOURCE_TYPE_FIELD,
      { field: 'primary_category', label: 'Kategorie', type: 'keyword' },
      { field: 'subcategories', label: 'Unterkategorien', type: 'keyword' },
      { field: 'published_at', label: 'Datum', type: 'date_range' },
    ],
    defaultFilter: { field: 'landesverband', value: 'MV' },
  },
  'brandenburg-system': {
    id: 'brandenburg-system',
    key: 'brandenburg',
    country: 'DE',
    includeInDefaultSearch: false,
    mcpExposed: true,
    qdrantCollection: 'landesverbaende_documents',
    name: 'Grüne Brandenburg',
    description:
      'Pressemitteilungen, Beschlüsse und Landtagswahlprogramm 2024 der Grünen Brandenburg',
    minQuality: 0.3,
    recallLimit: 60,
    filterableFields: [
      LV_CONTENT_TYPE_FIELD,
      { field: 'primary_category', label: 'Kategorie', type: 'keyword' },
      { field: 'subcategories', label: 'Unterkategorien', type: 'keyword' },
      { field: 'published_at', label: 'Datum', type: 'date_range' },
    ],
    defaultFilter: { field: 'landesverband', value: 'BB' },
  },
  'sachsen-anhalt-system': {
    id: 'sachsen-anhalt-system',
    key: 'sachsen-anhalt',
    country: 'DE',
    includeInDefaultSearch: false,
    mcpExposed: true,
    qdrantCollection: 'landesverbaende_documents',
    name: 'Grüne Sachsen-Anhalt',
    description:
      'Pressemitteilungen, Beschlüsse und Landtagswahlprogramm 2026 der Grünen Sachsen-Anhalt (Landesverband & Fraktion)',
    minQuality: 0.3,
    recallLimit: 60,
    filterableFields: [
      LV_CONTENT_TYPE_FIELD,
      LV_SOURCE_TYPE_FIELD,
      { field: 'published_at', label: 'Datum', type: 'date_range' },
    ],
    defaultFilter: { field: 'landesverband', value: ['LSA', 'LSA-F'] },
  },
  'hessen-system': {
    id: 'hessen-system',
    key: 'hessen',
    country: 'DE',
    includeInDefaultSearch: false,
    mcpExposed: true,
    qdrantCollection: 'landesverbaende_documents',
    name: 'Grüne Hessen',
    description: 'Pressemitteilungen und Beschlüsse der Grünen Hessen (Landesverband & Fraktion)',
    minQuality: 0.3,
    recallLimit: 60,
    filterableFields: [
      LV_CONTENT_TYPE_FIELD,
      LV_SOURCE_TYPE_FIELD,
      { field: 'published_at', label: 'Datum', type: 'date_range' },
    ],
    defaultFilter: { field: 'landesverband', value: ['HE', 'HE-F'] },
  },
  'saarland-system': {
    id: 'saarland-system',
    key: 'saarland',
    country: 'DE',
    includeInDefaultSearch: false,
    mcpExposed: true,
    qdrantCollection: 'landesverbaende_documents',
    name: 'Grüne Saarland',
    description: 'Pressemitteilungen, Artikel und Parteitagsbeschlüsse der Grünen Saarland',
    minQuality: 0.3,
    recallLimit: 60,
    filterableFields: [
      LV_CONTENT_TYPE_FIELD,
      { field: 'primary_category', label: 'Kategorie', type: 'keyword' },
      { field: 'subcategories', label: 'Unterkategorien', type: 'keyword' },
      { field: 'published_at', label: 'Datum', type: 'date_range' },
    ],
    defaultFilter: { field: 'landesverband', value: 'SL' },
  },
  // Previously missing → getSearchParams('examples-system') silently fell back.
  'examples-system': {
    id: 'examples-system',
    key: 'examples',
    includeInDefaultSearch: false,
    mcpExposed: true,
    qdrantCollection: 'social_media_examples',
    name: 'Social Media Beispiele',
    description: 'Erfolgreiche Instagram- und Facebook-Posts als Inspiration für eigene Inhalte',
    minQuality: 0.3,
    recallLimit: 60,
    filterableFields: [
      { field: 'platform', label: 'Plattform', type: 'keyword' },
      { field: 'country', label: 'Land', type: 'keyword' },
      { field: 'content_type', label: 'Inhaltstyp', type: 'keyword' },
    ],
  },
  // Agent-only (gruenerator-ricarda-lang). Configured so getSearchParams /
  // COLLECTION_MAP resolution stops silently falling back.
  'ricarda-lang-tweets-system': {
    id: 'ricarda-lang-tweets-system',
    key: 'ricarda-lang-tweets',
    includeInDefaultSearch: false,
    mcpExposed: false,
    agentOnly: true,
    qdrantCollection: 'ricarda_lang_tweets',
    name: 'Ricarda Lang Tweets',
    description: 'Tweets von Ricarda Lang (nur über den spezialisierten Agenten erreichbar)',
    minQuality: 0.3,
    recallLimit: 60,
    filterableFields: [{ field: 'published_at', label: 'Datum', type: 'date_range' }],
  },
};

// Append the NLP theme + person facets to every NLP-enriched document collection.
const NLP_INJECTION_EXCLUDED = new Set([
  'satzungen-system',
  'examples-system',
  'ricarda-lang-tweets-system',
]);
for (const [id, config] of Object.entries(SYSTEM_COLLECTIONS)) {
  if (NLP_INJECTION_EXCLUDED.has(id)) continue;
  config.filterableFields = [...config.filterableFields, THEMES_FIELD, PERSONS_FIELD];
}

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

/** All system collection IDs, incl. agent-only + examples. */
export function getAllSystemCollectionIds(): string[] {
  return Object.keys(SYSTEM_COLLECTIONS);
}

/** General document corpus — excludes agent-only + the social-media examples. */
export function getSearchableSystemCollectionIds(): string[] {
  return Object.values(SYSTEM_COLLECTIONS)
    .filter((c) => !c.agentOnly && c.qdrantCollection !== 'social_media_examples')
    .map((c) => c.id);
}

/** Collections surfaced in the public MCP catalog (`GET /api/v1/collections`). */
export function getMcpExposedCollections(): SystemCollectionConfig[] {
  return Object.values(SYSTEM_COLLECTIONS).filter((c) => c.mcpExposed);
}

/** Resolve a canonical collection config by its chat-facing `key` (e.g. `bayern`). */
export function getCanonicalByKey(key: string): SystemCollectionConfig | undefined {
  return Object.values(SYSTEM_COLLECTIONS).find((c) => c.key === key);
}

/** True when the id is an agent-only collection (never user-selectable, e.g. ricarda). */
export function isAgentOnlyCollectionId(id: string): boolean {
  return SYSTEM_COLLECTIONS[id]?.agentOnly === true;
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
  return getSearchableSystemCollectionIds();
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

  for (const filterKey of MULTI_VALUE_FILTER_KEYS) {
    const filterValue: string | string[] | undefined = subcategoryFilters[filterKey];
    if (!filterValue) continue;

    if (Array.isArray(filterValue) && filterValue.length > 0) {
      if (filterValue.length === 1) {
        must.push({ key: filterKey, match: { value: filterValue[0] } });
      } else {
        must.push({ key: filterKey, match: { any: filterValue } });
      }
    } else if (typeof filterValue === 'string') {
      must.push({ key: filterKey, match: { value: filterValue } });
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
  getSearchableSystemCollectionIds,
  getMcpExposedCollections,
  getCanonicalByKey,
  buildSystemCollectionObject,
  getDefaultMultiCollectionIds,
  getCollectionFilterableFields,
  getSearchParams,
  getCollectionDefaultFilter,
  buildSubcategoryFilter,
  applyDefaultFilter,
};
