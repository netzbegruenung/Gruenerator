/**
 * Qdrant Collections Schema Configuration
 * Centralizes all collection definitions for the Qdrant vector database
 */

export const OPTIMIZER_PRESETS = {
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

export const HNSW_PRESETS = {
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

export const INDEX_TYPES = {
    keyword: { type: 'keyword' },
    keywordTenant: { type: 'keyword', is_tenant: true },
    text: { type: 'text', tokenizer: 'word', min_token_len: 2, max_token_len: 50, lowercase: true }
};

export const COLLECTION_SCHEMAS = {
    documents: {
        name: 'documents',
        optimizer: 'large',
        hnsw: 'standard',
        indexes: []
    },
    grundsatz_documents: {
        name: 'grundsatz_documents',
        optimizer: 'medium',
        hnsw: null,
        indexes: []
    },
    oesterreich_gruene_documents: {
        name: 'oesterreich_gruene_documents',
        optimizer: 'medium',
        hnsw: null,
        indexes: []
    },
    user_knowledge: {
        name: 'user_knowledge',
        optimizer: 'small',
        hnsw: null,
        indexes: []
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
    }
};

export const TEXT_SEARCH_COLLECTIONS = [
    'documents',
    'grundsatz_documents',
    'user_knowledge'
];

export const TEXT_SEARCH_INDEXES = [
    { field: 'chunk_text', type: 'text' },
    { field: 'title', type: 'keyword' },
    { field: 'filename', type: 'keyword' },
    { field: 'user_id', type: 'keywordTenant' }
];

export function getCollectionConfig(vectorSize, schema) {
    const config = {
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

export function getIndexSchema(indexType) {
    return INDEX_TYPES[indexType] ? { ...INDEX_TYPES[indexType] } : INDEX_TYPES.keyword;
}

export default {
    OPTIMIZER_PRESETS,
    HNSW_PRESETS,
    INDEX_TYPES,
    COLLECTION_SCHEMAS,
    TEXT_SEARCH_COLLECTIONS,
    TEXT_SEARCH_INDEXES,
    getCollectionConfig,
    getIndexSchema
};
