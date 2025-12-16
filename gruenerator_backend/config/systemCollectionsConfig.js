/**
 * System Collections Configuration
 *
 * Single source of truth for all system-level notebook collections.
 * These are pre-configured collections containing official party documents
 * that are available to all users without requiring ownership.
 */

const SYSTEM_COLLECTIONS = {
    'grundsatz-system': {
        id: 'grundsatz-system',
        qdrantCollection: 'grundsatz_documents',
        name: 'Grüne Grundsatzprogramme',
        description: 'Grundsatzprogramm 2020, EU-Wahlprogramm 2024, Regierungsprogramm 2025',
        minQuality: 0.3,
        recallLimit: 60
    },
    'bundestagsfraktion-system': {
        id: 'bundestagsfraktion-system',
        qdrantCollection: 'bundestag_content',
        name: 'Grüne Bundestagsfraktion',
        description: 'Fachtexte, Ziele und Positionen von gruene-bundestag.de',
        minQuality: 0.3,
        recallLimit: 60
    },
    'oesterreich-gruene-system': {
        id: 'oesterreich-gruene-system',
        qdrantCollection: 'oesterreich_gruene_documents',
        name: 'Die Grünen Österreich',
        description: 'Programme der Grünen – Die Grüne Alternative Österreich',
        minQuality: 0.3,
        recallLimit: 60
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
 * @returns {string[]}
 */
const getDefaultMultiCollectionIds = () => ['grundsatz-system', 'bundestagsfraktion-system'];

module.exports = {
    SYSTEM_COLLECTIONS,
    isSystemCollectionId,
    isSystemQdrantCollection,
    getSystemCollectionConfig,
    getSystemQdrantCollections,
    getAllSystemCollectionIds,
    buildSystemCollectionObject,
    getDefaultMultiCollectionIds
};
