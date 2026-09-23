/**
 * QdrantService Collection Management
 * Functions for creating and managing Qdrant collections and indexes
 */

import { type QdrantClient } from '@qdrant/js-client-rest';

import { createLogger } from '../../../utils/logger.js';

import type { CollectionStats, CollectionNames, CollectionKey } from './types.js';
import type {
  CollectionSchema,
  CollectionConfig,
} from '../../../config/qdrantCollectionsSchema.js';
import type { Logger } from 'winston';

// Re-export types from qdrantCollectionsSchema for consistency
export type {
  CollectionSchema,
  CollectionConfig,
} from '../../../config/qdrantCollectionsSchema.js';

/**
 * Index schema for Qdrant field_schema parameter
 * Uses Record<string, unknown> for API compatibility; `type` is the base
 * data_type Qdrant reports back in `payload_schema`.
 */
export type IndexSchema = { type: string } & Record<string, unknown>;

const logger = createLogger('QdrantCollections');

/**
 * Live index types of a collection, field → data_type. Empty on failure:
 * without it the backfill below degrades to create-only, which is what it
 * did before type changes were applied at all.
 */
async function readLivePayloadTypes(
  client: QdrantClient,
  collectionName: string,
  log: Logger
): Promise<Record<string, string>> {
  try {
    const info = await client.getCollection(collectionName);
    const types: Record<string, string> = {};
    for (const [field, index] of Object.entries(info.payload_schema ?? {})) {
      if (index?.data_type) types[field] = index.data_type;
    }
    return types;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn(`Failed to read payload schema of ${collectionName}: ${message}`);
    return {};
  }
}

/**
 * Index definition for text search
 */
export interface IndexDefinition {
  field: string;
  type: string;
}

/**
 * Snapshot result from Qdrant
 */
export interface SnapshotResult {
  name: string;
  creation_time?: string;
  size?: number;
}

/**
 * Create all collections from schema configuration
 * @param client - Qdrant client instance
 * @param vectorSize - Vector dimensions for the collections
 * @param collections - Collection name mappings
 * @param COLLECTION_SCHEMAS - Schema definitions for all collections
 * @param getCollectionConfig - Function to get collection configuration from schema
 * @param getIndexSchema - Function to get index schema from type
 * @param log - Optional logger instance
 */
export async function createCollections(
  client: QdrantClient,
  vectorSize: number,
  collections: CollectionNames,
  COLLECTION_SCHEMAS: Record<string, CollectionSchema>,
  getCollectionConfig: (vectorSize: number, schema: CollectionSchema) => CollectionConfig,
  getIndexSchema: (indexType: string) => IndexSchema,
  log: Logger = logger
): Promise<void> {
  try {
    const existingCollections = await client.getCollections();
    const existingNames = new Set(existingCollections.collections.map((c) => c.name));

    for (const [_key, schema] of Object.entries(COLLECTION_SCHEMAS)) {
      if (!existingNames.has(schema.name)) {
        try {
          const config = getCollectionConfig(vectorSize, schema);
          await client.createCollection(schema.name, config);
          log.debug(`Created ${schema.name} collection (${vectorSize} dims)`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (schema.handleRaceCondition && message.includes('already exists')) {
            log.debug(`Collection ${schema.name} already exists (race condition)`);
          } else {
            throw error;
          }
        }
      }

      // Ensure payload indexes for both new and pre-existing collections.
      // createPayloadIndex is idempotent (already-exists is caught), so this
      // backfills indexes added to a schema after its collection was created —
      // without it, schema index additions silently never apply to existing
      // collections (which broke the curated_lists facet → filter UI).
      //
      // It does NOT change the type of an index that already exists: Qdrant
      // answers "already exists" and keeps the old one. So a declared type
      // change (published_at keyword → datetime, #3190) is applied by comparing
      // the live payload_schema and dropping the stale index first. Only the
      // base data_type is compared — params (is_tenant, tokenizer) never
      // trigger a rebuild.
      //
      // This runs in every cluster worker at boot. Two workers can race on the
      // same field: one deletes, the other's delete finds nothing or removes
      // the freshly rebuilt index, both create, one of them hits "already
      // exists". Every interleaving ends with the declared type, so a failed
      // delete is logged and the create is attempted regardless.
      const liveTypes = schema.indexes?.length
        ? await readLivePayloadTypes(client, schema.name, log)
        : {};
      for (const index of schema.indexes || []) {
        const fieldSchema = getIndexSchema(index.type);
        const liveType = liveTypes[index.field];
        if (liveType && liveType !== fieldSchema.type) {
          log.info(
            `Rebuilding index ${index.field} on ${schema.name}: ${liveType} → ${fieldSchema.type}`
          );
          try {
            await client.deletePayloadIndex(schema.name, index.field);
          } catch (deleteError) {
            const message =
              deleteError instanceof Error ? deleteError.message : String(deleteError);
            log.warn(`Failed to delete index ${index.field} on ${schema.name}: ${message}`);
          }
        }
        try {
          await client.createPayloadIndex(schema.name, {
            field_name: index.field,
            field_schema: fieldSchema,
          });
        } catch (indexError) {
          const message = indexError instanceof Error ? indexError.message : String(indexError);
          if (!message.includes('already exists')) {
            log.warn(`Failed to create index ${index.field} on ${schema.name}: ${message}`);
          }
        }
      }
    }

    log.info(`Collections created/verified successfully`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`Failed to create collections: ${message}`);
    throw new Error(`Collection creation failed: ${message}`);
  }
}

/**
 * Create text search indexes for hybrid search functionality
 * @param client - Qdrant client instance
 * @param collections - Collection name mappings
 * @param TEXT_SEARCH_COLLECTIONS - Array of collection keys that need text search indexes
 * @param TEXT_SEARCH_INDEXES - Array of index definitions for text search
 * @param getIndexSchema - Function to get index schema from type
 * @param log - Optional logger instance
 */
export async function createTextSearchIndexes(
  client: QdrantClient,
  collections: CollectionNames,
  TEXT_SEARCH_COLLECTIONS: string[],
  TEXT_SEARCH_INDEXES: IndexDefinition[],
  getIndexSchema: (indexType: string) => IndexSchema,
  log: Logger = logger
): Promise<void> {
  let indexedCount = 0;
  let createdIndexes = 0;

  for (const collectionKey of TEXT_SEARCH_COLLECTIONS) {
    const fullName = collections[collectionKey as CollectionKey];
    if (!fullName) {
      log.warn(`Collection key ${collectionKey} not found in collections mapping`);
      continue;
    }

    for (const index of TEXT_SEARCH_INDEXES) {
      try {
        await client.createPayloadIndex(fullName, {
          field_name: index.field,
          field_schema: getIndexSchema(index.type),
        });
        createdIndexes++;
        log.debug(`Created text search index ${index.field} on ${fullName}`);
      } catch (indexError) {
        const message = indexError instanceof Error ? indexError.message : String(indexError);
        if (!message.includes('already exists')) {
          log.debug(`Index creation failed for ${fullName}.${index.field}: ${message}`);
        }
      }
    }
    indexedCount++;
  }

  if (indexedCount > 0) {
    log.debug(
      `Processed text search indexes for ${indexedCount} collections (${createdIndexes} new indexes created)`
    );
  }
}

/**
 * Get statistics for a single collection
 * @param client - Qdrant client instance
 * @param collectionName - Name of the collection to get stats for
 * @returns Collection statistics or error object
 */
export async function getCollectionStats(
  client: QdrantClient,
  collectionName: string
): Promise<CollectionStats> {
  try {
    const info = await client.getCollection(collectionName);
    // Cast info to access potentially renamed/optional properties
    const infoData = info as Record<string, unknown>;
    const vectorsCount = (infoData.vectors_count ?? infoData.points_count) as
      number | null | undefined;
    const indexedVectorsCount = info.indexed_vectors_count as number | null | undefined;
    const pointsCount = info.points_count as number | null | undefined;
    const segmentsCount = info.segments_count as number | null | undefined;
    return {
      name: collectionName,
      ...(vectorsCount != null && { vectors_count: vectorsCount }),
      ...(indexedVectorsCount != null && { indexed_vectors_count: indexedVectorsCount }),
      ...(pointsCount != null && { points_count: pointsCount }),
      ...(segmentsCount != null && { segments_count: segmentsCount }),
      status: info.status,
      optimizer_status:
        typeof info.optimizer_status === 'object'
          ? JSON.stringify(info.optimizer_status)
          : String(info.optimizer_status),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to get stats for collection ${collectionName}: ${message}`);
    return {
      name: collectionName,
      error: message,
    };
  }
}

/**
 * Get statistics for all collections
 * @param client - Qdrant client instance
 * @param collections - Collection name mappings
 * @returns Record of collection stats keyed by collection key
 */
export async function getAllStats(
  client: QdrantClient,
  collections: CollectionNames
): Promise<Record<CollectionKey, CollectionStats>> {
  const stats: Record<string, CollectionStats> = {};

  try {
    const entries = Object.entries(collections) as Array<[CollectionKey, string]>;

    // Fetch stats in parallel for better performance
    const statsPromises = entries.map(async ([key, collectionName]) => {
      const collectionStats = await getCollectionStats(client, collectionName);
      return { key, stats: collectionStats };
    });

    const results = await Promise.all(statsPromises);

    for (const { key, stats: collectionStats } of results) {
      stats[key] = collectionStats;
    }

    return stats as Record<CollectionKey, CollectionStats>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to get all stats: ${message}`);

    // Return partial stats with error for the overall operation
    return stats as Record<CollectionKey, CollectionStats>;
  }
}

/**
 * Create a backup snapshot for a collection
 * @param client - Qdrant client instance
 * @param collectionName - Name of the collection to snapshot
 * @returns Snapshot result with name and metadata
 */
export async function createSnapshot(
  client: QdrantClient,
  collectionName: string
): Promise<SnapshotResult> {
  try {
    const snapshot = await client.createSnapshot(collectionName);
    logger.info(`Snapshot created for ${collectionName}: ${JSON.stringify(snapshot)}`);
    return snapshot as SnapshotResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to create snapshot for ${collectionName}: ${message}`);
    throw new Error(`Snapshot creation failed: ${message}`);
  }
}
