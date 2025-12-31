/**
 * System Collections Configuration
 *
 * Single source of truth for all system-level notebook collections.
 * These are pre-configured collections containing official party documents
 * that are available to all users without requiring ownership.
 */

/**
 * Default search parameters - used when collection doesn't specify overrides
 */
const DEFAULT_SEARCH_PARAMS = {
    limit: 30,
    threshold: 0.35,
    recallLimit: 50,
    vectorWeight: 0.7,
    textWeight: 0.3,
    mode: 'hybrid'
};

const SYSTEM_COLLECTIONS = {
    'grundsatz-system': {
        id: 'grundsatz-system',
        qdrantCollection: 'grundsatz_documents',
        name: 'Grüne Grundsatzprogramme',
        description: 'Grundsatzprogramm 2020, EU-Wahlprogramm 2024, Regierungsprogramm 2025',
        minQuality: 0.3,
        recallLimit: 60,
        filterableFields: [
            { field: 'primary_category', label: 'Programm', type: 'keyword' }
        ]
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
            { field: 'country', label: 'Land', type: 'keyword' }
        ]
    },
    'oesterreich-gruene-system': {
        id: 'oesterreich-gruene-system',
        qdrantCollection: 'oesterreich_gruene_documents',
        name: 'Die Grünen Österreich',
        description: 'Programme der Grünen – Die Grüne Alternative Österreich',
        minQuality: 0.3,
        recallLimit: 60,
        filterableFields: [
            { field: 'primary_category', label: 'Programm', type: 'keyword' }
        ]
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
            { field: 'country', label: 'Land', type: 'keyword' }
        ]
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
            { field: 'subcategories', label: 'Unterkategorien', type: 'keyword' }
        ]
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
            { field: 'country', label: 'Land', type: 'keyword' }
        ]
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
            { field: 'region', label: 'Region', type: 'keyword' }
        ]
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
            { field: 'gremium', label: 'Gremium', type: 'keyword' }
        ]
    }
};

/**
 * Check if a collection ID is a system collection
 * @param {string} id - Collection ID to check
 * @returns {boolean}
 */
const isSystemCollectionId = (id) => id in SYSTEM_COLLECTIONS;

/**
 * Check if a Qdrant collection name is a system collection
 * @param {string} name - Qdrant collection name to check
 * @returns {boolean}
 */
const isSystemQdrantCollection = (name) =>
    Object.values(SYSTEM_COLLECTIONS).some(c => c.qdrantCollection === name);

/**
 * Get full configuration for a system collection by ID
 * @param {string} id - Collection ID
 * @returns {Object|undefined} Collection config or undefined if not found
 */
const getSystemCollectionConfig = (id) => SYSTEM_COLLECTIONS[id];

/**
 * Get all system Qdrant collection names
 * @returns {string[]}
 */
const getSystemQdrantCollections = () =>
    Object.values(SYSTEM_COLLECTIONS).map(c => c.qdrantCollection);

/**
 * Get all system collection IDs
 * @returns {string[]}
 */
const getAllSystemCollectionIds = () => Object.keys(SYSTEM_COLLECTIONS);

/**
 * Build a collection object suitable for notebook graph processing
 * @param {string} id - System collection ID
 * @returns {Object|null} Collection object or null if not a system collection
 */
const buildSystemCollectionObject = (id) => {
    const config = SYSTEM_COLLECTIONS[id];
    if (!config) return null;

    return {
        id: config.id,
        user_id: 'SYSTEM',
        name: config.name,
        description: config.description,
        settings: {
            system_collection: true,
            min_quality: config.minQuality
        }
    };
};

/**
 * Get the default system collection IDs for multi-collection queries
 * Returns all system collections for comprehensive search
 * @returns {string[]}
 */
const getDefaultMultiCollectionIds = () => getAllSystemCollectionIds();

/**
 * Get filterable fields for a system collection
 * @param {string} id - Collection ID
 * @returns {Array<{field: string, label: string, type: string}>}
 */
const getCollectionFilterableFields = (id) => SYSTEM_COLLECTIONS[id]?.filterableFields || [];

/**
 * Get search parameters for a collection (merges defaults with collection-specific overrides)
 * @param {string} id - Collection ID
 * @returns {Object} Search parameters
 */
const getSearchParams = (id) => {
    const config = SYSTEM_COLLECTIONS[id];
    if (!config) return { ...DEFAULT_SEARCH_PARAMS };

    return {
        ...DEFAULT_SEARCH_PARAMS,
        recallLimit: config.recallLimit || DEFAULT_SEARCH_PARAMS.recallLimit,
        qualityMin: config.minQuality || DEFAULT_SEARCH_PARAMS.threshold
    };
};

/**
 * Build Qdrant filter from subcategory filters
 * Supports both single values (string) and multi-select (array)
 * Uses unified field names: primary_category, content_type, subcategories, country, region
 * Also supports date range filtering with date_from and date_to
 * @param {Object} subcategoryFilters - Filters like { primary_category, content_type, subcategories, country, region, date_from, date_to }
 * @returns {Object|undefined} Qdrant filter object { must: [...] } or undefined
 */
const buildSubcategoryFilter = (subcategoryFilters) => {
    if (!subcategoryFilters || Object.keys(subcategoryFilters).length === 0) {
        return undefined;
    }

    const must = [];
    const filterKeys = ['primary_category', 'content_type', 'subcategories', 'country', 'region'];

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
        const range = {};
        if (subcategoryFilters.date_from) range.gte = subcategoryFilters.date_from;
        if (subcategoryFilters.date_to) range.lte = subcategoryFilters.date_to;
        must.push({ key: 'published_at', range });
    }

    return must.length > 0 ? { must } : undefined;
};

module.exports = {
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
    buildSubcategoryFilter
};
