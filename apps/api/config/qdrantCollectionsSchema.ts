/**
 * Qdrant Collections Schema Configuration
 * Centralizes all collection definitions for the Qdrant vector database
 */

// =============================================================================
// Type Definitions
// =============================================================================

export type OptimizerPresetKey = 'large' | 'medium' | 'small' | 'tiny' | 'minimal';

export interface OptimizerConfig {
  default_segment_number: number;
  /** In KB, not points — Qdrant measures both segment size and index threshold in kilobytes. */
  max_segment_size: number;
  memmap_threshold?: number;
  /**
   * In KB. Required, and it MUST stay below `max_segment_size`: a segment can
   * never grow past its own cap, so a threshold at or above the cap means the
   * HNSW index is never built. See the note on OPTIMIZER_PRESETS.
   */
  indexing_threshold: number;
}

export type HnswPresetKey = 'standard' | 'enhanced' | 'minimal';

export interface HnswConfig {
  m: number;
  ef_construct: number;
  full_scan_threshold?: number;
  max_indexing_threads?: number;
  payload_m?: number;
}

export type IndexTypeKey = 'keyword' | 'keywordTenant' | 'text' | 'datetime';

export interface IndexTypeConfig extends Record<string, unknown> {
  type: 'keyword' | 'text';
  is_tenant?: boolean;
  tokenizer?: string;
  min_token_len?: number;
  max_token_len?: number;
  lowercase?: boolean;
}

export interface CollectionSchemaIndex {
  field: string;
  type: IndexTypeKey;
}

export interface CollectionSchema {
  name: string;
  optimizer: OptimizerPresetKey | null;
  hnsw: HnswPresetKey | null;
  indexes: CollectionSchemaIndex[];
  handleRaceCondition?: boolean;
}

export interface CollectionConfig {
  vectors: {
    size: number;
    distance: 'Cosine';
  };
  sparse_vectors?: Record<string, { modifier?: 'idf'; index?: { on_disk?: boolean } }>;
  optimizers_config?: OptimizerConfig;
  hnsw_config?: HnswConfig;
}

/**
 * Name of the BM25 sparse vector on every collection. The dense vector stays
 * unnamed (`''`) for backward compatibility with all existing points and the
 * legacy search API. NOTE: Qdrant can only declare sparse vectors at
 * createCollection time — existing collections need the copy migration in
 * `scripts/migrate-bm25-sparse.ts`, updateCollection cannot add them.
 */
export const BM25_SPARSE_VECTOR_NAME = 'bm25';

// =============================================================================
// Optimizer Presets
// =============================================================================

/**
 * Both numbers are in KB. `indexing_threshold` is where Qdrant starts building
 * the HNSW index, `max_segment_size` is the ceiling the optimizer keeps every
 * segment under — so the threshold has to sit BELOW the ceiling, otherwise no
 * segment ever crosses it and `indexed_vectors_count` stays 0 forever, at any
 * collection size.
 *
 * Every preset used to violate that: `large` set both to 20000, and the other
 * four left `indexing_threshold` unset, which lands on Qdrant's default of
 * 20000 — at or above each of their caps. Measured on the prod instance before
 * the fix: `documents` held 33,175 points (136 MB) across 13 segments of ~10 MB
 * each, indexed 0. The only collection in the whole deployment with a built
 * index was `landesverbaende_documents`, whose live config carries
 * indexing_threshold 10000 against max_segment_size 20000 — a value that comes
 * from neither preset. The ratio below is that working collection's.
 *
 * `large.max_segment_size` was later raised from 20000 to 100000. Measured on
 * prod on 2026-09-03: `documents` held 48,119 points across **18 segments**
 * (45,667 indexed) — the 20000 KB cap was doing its job as a cap (a 1024-dim
 * float32 vector is ~4 KB, so 20000 KB ≈ 5,000 vectors per segment; 48k points
 * at ~5k/segment lands in that 18-segment range), but 18 live segments each
 * carry their own HNSW graph, so a query fans out to 18 graphs instead of a
 * handful. At 100000 KB (≈ 25,000 vectors/segment) the same collection lands
 * at 2-3 segments. `indexing_threshold` stays 10000 — the ratio only widens
 * (10000 vs 100000 instead of 10000 vs 20000), staying well below the ceiling.
 *
 * Note this only shapes collections at CREATE time; `getCollectionConfig` is
 * only ever read by `createCollection`. Existing collections keep whatever
 * they were made with until `scripts/patch-hnsw-indexing.ts` PATCHes their
 * `indexing_threshold` (and, since the ceiling raise, `max_segment_size` too)
 * to the preset (the only `updateCollection` caller).
 */
export const OPTIMIZER_PRESETS: Record<OptimizerPresetKey, OptimizerConfig> = {
  large: {
    default_segment_number: 2,
    max_segment_size: 100000,
    memmap_threshold: 10000,
    indexing_threshold: 10000,
  },
  medium: {
    default_segment_number: 2,
    max_segment_size: 20000,
    indexing_threshold: 10000,
  },
  small: {
    default_segment_number: 1,
    max_segment_size: 10000,
    indexing_threshold: 5000,
  },
  // The two smallest presets stay well under hnsw.full_scan_threshold (10000
  // points), so Qdrant answers them exactly regardless of whether an index
  // exists. The threshold is set anyway to keep the invariant uniform — a
  // preset that grows into a bigger role should not have to rediscover it.
  tiny: {
    default_segment_number: 1,
    max_segment_size: 5000,
    indexing_threshold: 2500,
  },
  minimal: {
    default_segment_number: 1,
    max_segment_size: 1000,
    indexing_threshold: 500,
  },
};

// =============================================================================
// HNSW Presets
// =============================================================================

export const HNSW_PRESETS: Record<HnswPresetKey, HnswConfig> = {
  standard: {
    m: 16,
    ef_construct: 100,
    full_scan_threshold: 10000,
    max_indexing_threads: 0,
  },
  enhanced: {
    payload_m: 16,
    m: 16,
    ef_construct: 200,
    full_scan_threshold: 10000,
    max_indexing_threads: 0,
  },
  minimal: {
    m: 16,
    ef_construct: 100,
  },
};

// =============================================================================
// Index Types
// =============================================================================

export const INDEX_TYPES: Record<IndexTypeKey, IndexTypeConfig> = {
  keyword: { type: 'keyword' },
  keywordTenant: { type: 'keyword', is_tenant: true },
  text: { type: 'text', tokenizer: 'word', min_token_len: 2, max_token_len: 50, lowercase: true },
  datetime: { type: 'keyword' },
};

// =============================================================================
// System Collection Standard Indexes
// =============================================================================

/**
 * Standard indexes for all system collections (unified schema)
 * These ensure consistent querying across all collections
 */
export const SYSTEM_COLLECTION_STANDARD_INDEXES: CollectionSchemaIndex[] = [
  { field: 'source_url', type: 'keyword' },
  { field: 'primary_category', type: 'keyword' },
  { field: 'content_type', type: 'keyword' },
  { field: 'subcategories', type: 'keyword' },
  { field: 'country', type: 'keyword' },
  { field: 'published_at', type: 'keyword' },
  { field: 'indexed_at', type: 'keyword' },
  { field: 'chunk_text', type: 'text' },
];

// =============================================================================
// Collection Schemas
// =============================================================================

export const COLLECTION_SCHEMAS: Record<string, CollectionSchema> = {
  // Per-user documents. Its `chunk_text`/`title`/`filename`/`user_id` indexes come
  // from TEXT_SEARCH_INDEXES below, not from this list — so a field that is only
  // ever filtered (never text-searched) has to be named here or it stays
  // unindexed. `document_id` is the main filter of every notebook query
  // (searchOperations.ts drops the `user_id` clause once documentIds is set, so
  // shared notebooks stay visible) and was missing from both lists: Qdrant read
  // the payload of all ~33k points per query, 125 ms instead of ~4 ms.
  documents: {
    name: 'documents',
    optimizer: 'large',
    hnsw: 'standard',
    indexes: [
      { field: 'document_id', type: 'keyword' },
      { field: 'source_type', type: 'keyword' },
    ],
  },
  grundsatz_documents: {
    name: 'grundsatz_documents',
    optimizer: 'medium',
    hnsw: 'standard',
    indexes: [
      { field: 'source_url', type: 'keyword' },
      { field: 'primary_category', type: 'keyword' },
      { field: 'indexed_at', type: 'keyword' },
      { field: 'chunk_text', type: 'text' },
    ],
  },
  oesterreich_gruene_documents: {
    name: 'oesterreich_gruene_documents',
    optimizer: 'medium',
    hnsw: 'standard',
    indexes: [
      { field: 'source_url', type: 'keyword' },
      { field: 'primary_category', type: 'keyword' },
      { field: 'indexed_at', type: 'keyword' },
      { field: 'chunk_text', type: 'text' },
    ],
  },
  user_knowledge: {
    name: 'user_knowledge',
    optimizer: 'small',
    hnsw: null,
    indexes: [],
  },
  custom_prompts: {
    name: 'custom_prompts',
    optimizer: 'small',
    hnsw: 'standard',
    indexes: [
      { field: 'user_id', type: 'keywordTenant' },
      { field: 'is_public', type: 'keyword' },
      { field: 'name', type: 'text' },
      { field: 'created_at', type: 'datetime' },
    ],
  },
  content_examples: {
    name: 'content_examples',
    optimizer: 'tiny',
    hnsw: 'minimal',
    indexes: [],
  },
  // User-submitted Vorlagen (templates). One point per template, vector built
  // from title + (AI/user) description + tags. Keyword indexes support later
  // filtered semantic search (published & public templates, by type/tags/owner).
  user_templates: {
    name: 'user_templates',
    optimizer: 'small',
    hnsw: 'standard',
    indexes: [
      { field: 'template_id', type: 'keyword' },
      { field: 'user_id', type: 'keywordTenant' },
      { field: 'template_type', type: 'keyword' },
      { field: 'status', type: 'keyword' },
      { field: 'is_private', type: 'keyword' },
      { field: 'tags', type: 'keyword' },
    ],
  },
  social_media_examples: {
    name: 'social_media_examples',
    optimizer: 'large',
    hnsw: 'enhanced',
    indexes: [
      { field: 'platform', type: 'keywordTenant' },
      { field: 'country', type: 'keyword' },
      { field: 'landesverband', type: 'keyword' },
    ],
    handleRaceCondition: true,
  },
  // Per-person tweet collection. Mirrors social_media_examples schema but lives
  // in its own collection so the agent-only `ricarda-lang-notebook` stays isolated.
  ricarda_lang_tweets: {
    name: 'ricarda_lang_tweets',
    optimizer: 'large',
    hnsw: 'enhanced',
    indexes: [
      { field: 'platform', type: 'keyword' },
      { field: 'source_account', type: 'keyword' },
      { field: 'published_at', type: 'datetime' },
    ],
    handleRaceCondition: true,
  },
  user_texts: {
    name: 'user_texts',
    optimizer: 'large',
    hnsw: 'enhanced',
    indexes: [
      { field: 'user_id', type: 'keywordTenant' },
      { field: 'document_type', type: 'keyword' },
      { field: 'title', type: 'keyword' },
    ],
  },
  notebook_collections: {
    name: 'notebook_collections',
    optimizer: 'tiny',
    hnsw: null,
    indexes: [
      { field: 'user_id', type: 'keywordTenant' },
      { field: 'collection_id', type: 'keyword' },
    ],
  },
  notebook_collection_documents: {
    name: 'notebook_collection_documents',
    optimizer: 'tiny',
    hnsw: null,
    indexes: [
      { field: 'collection_id', type: 'keyword' },
      { field: 'document_id', type: 'keyword' },
    ],
  },
  notebook_public_access: {
    name: 'notebook_public_access',
    optimizer: 'minimal',
    hnsw: null,
    indexes: [
      { field: 'access_token', type: 'keyword' },
      { field: 'collection_id', type: 'keyword' },
    ],
  },
  oparl_papers: {
    name: 'oparl_papers',
    optimizer: 'large',
    hnsw: 'standard',
    indexes: [
      { field: 'city', type: 'keywordTenant' },
      { field: 'paper_id', type: 'keyword' },
      { field: 'oparl_id', type: 'keyword' },
      { field: 'paper_type', type: 'keyword' },
      { field: 'chunk_text', type: 'text' },
    ],
  },
  kommunalwiki_documents: {
    name: 'kommunalwiki_documents',
    optimizer: 'medium',
    hnsw: 'standard',
    indexes: [
      { field: 'source_url', type: 'keyword' },
      { field: 'primary_category', type: 'keyword' },
      { field: 'content_type', type: 'keyword' },
      { field: 'subcategories', type: 'keyword' },
      { field: 'indexed_at', type: 'keyword' },
      { field: 'chunk_text', type: 'text' },
    ],
  },
  bundestag_content: {
    name: 'bundestag_content',
    optimizer: 'large',
    hnsw: 'standard',
    indexes: [
      { field: 'source_url', type: 'keyword' },
      { field: 'primary_category', type: 'keyword' },
      { field: 'country', type: 'keyword' },
      { field: 'published_at', type: 'keyword' },
      { field: 'indexed_at', type: 'keyword' },
      { field: 'chunk_text', type: 'text' },
    ],
  },
  gruene_de_documents: {
    name: 'gruene_de_documents',
    optimizer: 'large',
    hnsw: 'standard',
    indexes: [
      { field: 'source_url', type: 'keyword' },
      { field: 'primary_category', type: 'keyword' },
      { field: 'country', type: 'keyword' },
      { field: 'published_at', type: 'keyword' },
      { field: 'indexed_at', type: 'keyword' },
      { field: 'chunk_text', type: 'text' },
    ],
  },
  gruene_at_documents: {
    name: 'gruene_at_documents',
    optimizer: 'large',
    hnsw: 'standard',
    indexes: [
      { field: 'source_url', type: 'keyword' },
      { field: 'primary_category', type: 'keyword' },
      { field: 'country', type: 'keyword' },
      { field: 'published_at', type: 'keyword' },
      { field: 'indexed_at', type: 'keyword' },
      { field: 'chunk_text', type: 'text' },
    ],
  },
  boell_stiftung_documents: {
    name: 'boell_stiftung_documents',
    optimizer: 'large',
    hnsw: 'standard',
    indexes: [
      { field: 'source_url', type: 'keyword' },
      { field: 'primary_category', type: 'keyword' },
      { field: 'content_type', type: 'keyword' },
      { field: 'subcategories', type: 'keyword' },
      { field: 'region', type: 'keyword' },
      { field: 'indexed_at', type: 'keyword' },
      { field: 'chunk_text', type: 'text' },
    ],
  },
  gruenblog_documents: {
    name: 'gruenblog_documents',
    optimizer: 'small',
    hnsw: 'standard',
    indexes: [
      { field: 'source_url', type: 'keyword' },
      { field: 'primary_category', type: 'keyword' },
      { field: 'content_type', type: 'keyword' },
      { field: 'subcategories', type: 'keyword' },
      { field: 'published_at', type: 'keyword' },
      { field: 'indexed_at', type: 'keyword' },
      { field: 'chunk_text', type: 'text' },
    ],
  },
  satzungen_documents: {
    name: 'satzungen_documents',
    optimizer: 'medium',
    hnsw: 'standard',
    indexes: [
      { field: 'source_url', type: 'keyword' },
      { field: 'landesverband', type: 'keyword' },
      { field: 'gremium', type: 'keyword' },
      { field: 'city', type: 'keyword' },
      { field: 'indexed_at', type: 'keyword' },
      { field: 'chunk_text', type: 'text' },
    ],
  },
  landesverbaende_documents: {
    name: 'landesverbaende_documents',
    optimizer: 'medium',
    hnsw: 'standard',
    indexes: [
      { field: 'source_url', type: 'keyword' },
      { field: 'content_type', type: 'keyword' },
      { field: 'primary_category', type: 'keyword' },
      { field: 'landesverband', type: 'keyword' },
      { field: 'source_id', type: 'keyword' },
      { field: 'published_at', type: 'keyword' },
      { field: 'indexed_at', type: 'keyword' },
      { field: 'chunk_text', type: 'text' },
    ],
  },
  // Cold archive for Landesverband documents past their source's maxAgeYears.
  // The scraper moves stale points here (vectors + payload preserved) instead of
  // deleting them, so notebooks/agents — which only ever query
  // landesverbaende_documents — never surface them, while historical/research
  // functions can still opt in by querying this collection explicitly. Mirrors
  // the main collection's indexes (incl. `landesverband`) so a per-notebook
  // archive view is just a filter, not a separate physical collection.
  landesverbaende_archive: {
    name: 'landesverbaende_archive',
    optimizer: 'small',
    hnsw: 'standard',
    indexes: [
      { field: 'source_url', type: 'keyword' },
      { field: 'content_type', type: 'keyword' },
      { field: 'primary_category', type: 'keyword' },
      { field: 'landesverband', type: 'keyword' },
      { field: 'source_id', type: 'keyword' },
      { field: 'published_at', type: 'keyword' },
      { field: 'indexed_at', type: 'keyword' },
      { field: 'chunk_text', type: 'text' },
    ],
  },
  // Abgeordnetenwatch transparency corpus: namentliche Abstimmungen +
  // Nebentätigkeiten (one collection, discriminated by content_type). Facets
  // support the notebook's Abstimmung/Nebentätigkeit, Partei, Einkommensstufe
  // and Grünen-Votum filters.
  abgeordnetenwatch_documents: {
    name: 'abgeordnetenwatch_documents',
    optimizer: 'medium',
    hnsw: 'standard',
    indexes: [
      { field: 'source_url', type: 'keyword' },
      { field: 'content_type', type: 'keyword' },
      { field: 'primary_category', type: 'keyword' },
      { field: 'subcategories', type: 'keyword' },
      { field: 'parliament', type: 'keyword' },
      { field: 'party', type: 'keyword' },
      { field: 'person', type: 'keyword' },
      { field: 'income_level', type: 'keyword' },
      { field: 'gruene_vote', type: 'keyword' },
      { field: 'published_at', type: 'keyword' },
      { field: 'indexed_at', type: 'keyword' },
      { field: 'chunk_text', type: 'text' },
    ],
  },
  // The person's explicit memory — only `kind = 'fakt'` rows are mirrored here
  // for retrieval; instructions live in the prompt (services/memory/memoryStore.ts).
  // Same collection mem0 used; its old points lack `kind` and are filtered out.
  user_memories: {
    name: 'user_memories',
    optimizer: 'small',
    hnsw: 'standard',
    indexes: [
      { field: 'user_id', type: 'keywordTenant' },
      { field: 'kind', type: 'keyword' },
      { field: 'memory_id', type: 'keyword' },
    ],
  },
  // One point per chat thread (title + tags + first message + compaction
  // summary) for semantic recall of the user's own past conversations.
  chat_thread_recall: {
    name: 'chat_thread_recall',
    optimizer: 'small',
    hnsw: 'standard',
    indexes: [
      { field: 'user_id', type: 'keywordTenant' },
      { field: 'thread_id', type: 'keyword' },
      { field: 'thread_type', type: 'keyword' },
    ],
  },
};

// =============================================================================
// Text Search Configuration
// =============================================================================

export const TEXT_SEARCH_COLLECTIONS: string[] = [
  'documents',
  'grundsatz_documents',
  'user_knowledge',
];

export const TEXT_SEARCH_INDEXES: CollectionSchemaIndex[] = [
  { field: 'chunk_text', type: 'text' },
  { field: 'title', type: 'keyword' },
  { field: 'filename', type: 'keyword' },
  { field: 'user_id', type: 'keywordTenant' },
];

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get collection configuration from schema
 */
export function getCollectionConfig(
  vectorSize: number,
  schema: CollectionSchema
): CollectionConfig {
  const config: CollectionConfig = {
    vectors: {
      size: vectorSize,
      distance: 'Cosine',
    },
    sparse_vectors: {
      [BM25_SPARSE_VECTOR_NAME]: { modifier: 'idf' },
    },
  };

  if (schema.optimizer && OPTIMIZER_PRESETS[schema.optimizer]) {
    config.optimizers_config = { ...OPTIMIZER_PRESETS[schema.optimizer] };
  }

  if (schema.hnsw && HNSW_PRESETS[schema.hnsw]) {
    config.hnsw_config = { ...HNSW_PRESETS[schema.hnsw] };
  }

  return config;
}

/**
 * Get index schema from type key
 */
export function getIndexSchema(indexType: IndexTypeKey | string): IndexTypeConfig {
  return INDEX_TYPES[indexType as IndexTypeKey]
    ? { ...INDEX_TYPES[indexType as IndexTypeKey] }
    : { ...INDEX_TYPES.keyword };
}

// =============================================================================
// Default Export
// =============================================================================

export default {
  OPTIMIZER_PRESETS,
  HNSW_PRESETS,
  INDEX_TYPES,
  COLLECTION_SCHEMAS,
  SYSTEM_COLLECTION_STANDARD_INDEXES,
  TEXT_SEARCH_COLLECTIONS,
  TEXT_SEARCH_INDEXES,
  getCollectionConfig,
  getIndexSchema,
};
