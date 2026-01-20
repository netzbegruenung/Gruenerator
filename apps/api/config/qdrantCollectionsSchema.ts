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
    max_segment_size: number;
    memmap_threshold?: number;
    indexing_threshold?: number;
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
    optimizers_config?: OptimizerConfig;
    hnsw_config?: HnswConfig;
}

// =============================================================================
// Optimizer Presets
// =============================================================================

export const OPTIMIZER_PRESETS: Record<OptimizerPresetKey, OptimizerConfig> = {
    large: {
        default_segment_number: 2,
        max_segment_size: 20000,
        memmap_threshold: 10000,
        indexing_threshold: 20000
    },
    medium: {
        default_segment_number: 2,
        max_segment_size: 20000
    },
    small: {
        default_segment_number: 1,
        max_segment_size: 10000
    },
    tiny: {
        default_segment_number: 1,
        max_segment_size: 5000
    },
    minimal: {
        default_segment_number: 1,
        max_segment_size: 1000
    }
};

// =============================================================================
// HNSW Presets
// =============================================================================

export const HNSW_PRESETS: Record<HnswPresetKey, HnswConfig> = {
    standard: {
        m: 16,
        ef_construct: 100,
        full_scan_threshold: 10000,
        max_indexing_threads: 0
    },
    enhanced: {
        payload_m: 16,
        m: 16,
        ef_construct: 200,
        full_scan_threshold: 10000,
        max_indexing_threads: 0
    },
    minimal: {
        m: 16,
        ef_construct: 100
    }
};

// =============================================================================
// Index Types
// =============================================================================

export const INDEX_TYPES: Record<IndexTypeKey, IndexTypeConfig> = {
    keyword: { type: 'keyword' },
    keywordTenant: { type: 'keyword', is_tenant: true },
    text: { type: 'text', tokenizer: 'word', min_token_len: 2, max_token_len: 50, lowercase: true },
    datetime: { type: 'keyword' }
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
    { field: 'chunk_text', type: 'text' }
];

// =============================================================================
// Collection Schemas
// =============================================================================

export const COLLECTION_SCHEMAS: Record<string, CollectionSchema> = {
    documents: {
        name: 'documents',
        optimizer: 'large',
        hnsw: 'standard',
        indexes: []
    },
    grundsatz_documents: {
        name: 'grundsatz_documents',
        optimizer: 'medium',
        hnsw: 'standard',
        indexes: [
            { field: 'source_url', type: 'keyword' },
            { field: 'primary_category', type: 'keyword' },
            { field: 'indexed_at', type: 'keyword' },
            { field: 'chunk_text', type: 'text' }
        ]
    },
    oesterreich_gruene_documents: {
        name: 'oesterreich_gruene_documents',
        optimizer: 'medium',
        hnsw: 'standard',
        indexes: [
            { field: 'source_url', type: 'keyword' },
            { field: 'primary_category', type: 'keyword' },
            { field: 'indexed_at', type: 'keyword' },
            { field: 'chunk_text', type: 'text' }
        ]
    },
    user_knowledge: {
        name: 'user_knowledge',
        optimizer: 'small',
        hnsw: null,
        indexes: []
    },
    custom_prompts: {
        name: 'custom_prompts',
        optimizer: 'small',
        hnsw: 'standard',
        indexes: [
            { field: 'user_id', type: 'keywordTenant' },
            { field: 'is_public', type: 'keyword' },
            { field: 'name', type: 'text' },
            { field: 'created_at', type: 'datetime' }
        ]
    },
    content_examples: {
        name: 'content_examples',
        optimizer: 'tiny',
        hnsw: 'minimal',
        indexes: []
    },
    social_media_examples: {
        name: 'social_media_examples',
        optimizer: 'large',
        hnsw: 'enhanced',
        indexes: [
            { field: 'platform', type: 'keywordTenant' }
        ],
        handleRaceCondition: true
    },
    user_texts: {
        name: 'user_texts',
        optimizer: 'large',
        hnsw: 'enhanced',
        indexes: [
            { field: 'user_id', type: 'keywordTenant' },
            { field: 'document_type', type: 'keyword' },
            { field: 'title', type: 'keyword' }
        ]
    },
    notebook_collections: {
        name: 'notebook_collections',
        optimizer: 'tiny',
        hnsw: null,
        indexes: [
            { field: 'user_id', type: 'keywordTenant' },
            { field: 'collection_id', type: 'keyword' }
        ]
    },
    notebook_collection_documents: {
        name: 'notebook_collection_documents',
        optimizer: 'tiny',
        hnsw: null,
        indexes: [
            { field: 'collection_id', type: 'keyword' },
            { field: 'document_id', type: 'keyword' }
        ]
    },
    notebook_usage_logs: {
        name: 'notebook_usage_logs',
        optimizer: 'small',
        hnsw: null,
        indexes: [
            { field: 'collection_id', type: 'keyword' },
            { field: 'user_id', type: 'keyword' }
        ]
    },
    notebook_public_access: {
        name: 'notebook_public_access',
        optimizer: 'minimal',
        hnsw: null,
        indexes: [
            { field: 'access_token', type: 'keyword' },
            { field: 'collection_id', type: 'keyword' }
        ]
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
            { field: 'chunk_text', type: 'text' }
        ]
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
            { field: 'chunk_text', type: 'text' }
        ]
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
            { field: 'chunk_text', type: 'text' }
        ]
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
            { field: 'chunk_text', type: 'text' }
        ]
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
            { field: 'chunk_text', type: 'text' }
        ]
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
            { field: 'chunk_text', type: 'text' }
        ]
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
            { field: 'chunk_text', type: 'text' }
        ]
    },
    hamburg_documents: {
        name: 'hamburg_documents',
        optimizer: 'medium',
        hnsw: 'standard',
        indexes: [
            { field: 'source_url', type: 'keyword' },
            { field: 'content_type', type: 'keyword' },
            { field: 'primary_category', type: 'keyword' },
            { field: 'landesverband', type: 'keyword' },
            { field: 'published_at', type: 'keyword' },
            { field: 'indexed_at', type: 'keyword' },
            { field: 'chunk_text', type: 'text' }
        ]
    }
};

// =============================================================================
// Text Search Configuration
// =============================================================================

export const TEXT_SEARCH_COLLECTIONS: string[] = [
    'documents',
    'grundsatz_documents',
    'user_knowledge'
];

export const TEXT_SEARCH_INDEXES: CollectionSchemaIndex[] = [
    { field: 'chunk_text', type: 'text' },
    { field: 'title', type: 'keyword' },
    { field: 'filename', type: 'keyword' },
    { field: 'user_id', type: 'keywordTenant' }
];

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get collection configuration from schema
 */
export function getCollectionConfig(vectorSize: number, schema: CollectionSchema): CollectionConfig {
    const config: CollectionConfig = {
        vectors: {
            size: vectorSize,
            distance: 'Cosine'
        }
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
    getIndexSchema
};
