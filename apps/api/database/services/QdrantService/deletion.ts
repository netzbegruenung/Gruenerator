/**
 * QdrantService Deletion Functions
 * Extracted deletion operations for vector data removal
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { createLogger } from '../../../utils/logger.js';
import type { Logger } from 'winston';

const defaultLogger = createLogger('QdrantDeletion');

/**
 * Result interface for deletion operations
 */
export interface DeleteResult {
  success: boolean;
  collection: string;
  deletedCount?: number;
  error?: string;
}

/**
 * Result interface for multi-collection deletion operations
 */
export interface MultiDeleteResult {
  success: boolean;
  collections: string[];
  results: DeleteResult[];
  totalDeleted?: number;
  errors?: string[];
}

/**
 * Qdrant filter for deletion operations
 */
interface QdrantFilter {
  must?: Array<{
    key: string;
    match: { value: string | number };
  }>;
}

/**
 * Delete all vectors for a document by document_id
 * @param client - Qdrant client instance
 * @param collection - Collection name to delete from
 * @param documentId - Document identifier to delete
 * @param logger - Optional logger instance (defaults to module logger)
 * @returns Delete result with success status
 */
export async function deleteDocument(
  client: QdrantClient,
  collection: string,
  documentId: string,
  logger: Logger = defaultLogger
): Promise<DeleteResult> {
  try {
    logger.debug(`Deleting document ${documentId} from collection ${collection}`);

    const filter: QdrantFilter = {
      must: [{ key: 'document_id', match: { value: documentId } }],
    };

    await client.delete(collection, {
      filter: filter,
    });

    logger.info(`Deleted document ${documentId} from ${collection}`);
    return {
      success: true,
      collection: collection,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to delete document ${documentId}: ${message}`);
    return {
      success: false,
      collection: collection,
      error: message,
    };
  }
}

/**
 * Delete all vectors for a user from multiple collections
 * Typically used for GDPR data deletion or account cleanup
 * @param client - Qdrant client instance
 * @param collections - Array of collection names to delete from (e.g., ['documents', 'user_knowledge'])
 * @param userId - User identifier to delete vectors for
 * @param logger - Optional logger instance (defaults to module logger)
 * @returns Multi-delete result with status per collection
 */
export async function deleteUserVectors(
  client: QdrantClient,
  collections: string[],
  userId: string,
  logger: Logger = defaultLogger
): Promise<MultiDeleteResult> {
  logger.debug(`Deleting all vectors for user ${userId} from ${collections.length} collections`);

  const results: DeleteResult[] = [];
  const errors: string[] = [];

  const filter: QdrantFilter = {
    must: [{ key: 'user_id', match: { value: userId } }],
  };

  for (const collection of collections) {
    try {
      await client.delete(collection, {
        filter: filter,
      });

      logger.debug(`Deleted user ${userId} vectors from ${collection}`);
      results.push({
        success: true,
        collection: collection,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to delete user vectors from ${collection}: ${message}`);
      errors.push(`${collection}: ${message}`);
      results.push({
        success: false,
        collection: collection,
        error: message,
      });
    }
  }

  const allSuccess = results.every((r) => r.success);

  if (allSuccess) {
    logger.info(
      `Successfully deleted all vectors for user ${userId} from ${collections.length} collections`
    );
  } else {
    logger.warn(
      `Partial deletion for user ${userId}: ${results.filter((r) => r.success).length}/${collections.length} collections succeeded`
    );
  }

  return {
    success: allSuccess,
    collections: collections,
    results: results,
    ...(errors.length > 0 ? { errors } : {}),
  };
}

/**
 * Delete bundestag content vectors by source URL
 * @param client - Qdrant client instance
 * @param collection - Bundestag collection name
 * @param url - Source URL to delete
 * @param logger - Optional logger instance (defaults to module logger)
 * @returns Delete result with success status
 */
export async function deleteBundestagContentByUrl(
  client: QdrantClient,
  collection: string,
  url: string,
  logger: Logger = defaultLogger
): Promise<DeleteResult> {
  try {
    logger.debug(`Deleting bundestag content for URL: ${url}`);

    const filter: QdrantFilter = {
      must: [{ key: 'source_url', match: { value: url } }],
    };

    await client.delete(collection, {
      filter: filter,
    });

    logger.info(`Deleted bundestag content from ${collection} for URL: ${url}`);
    return {
      success: true,
      collection: collection,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to delete bundestag content for URL ${url}: ${message}`);
    return {
      success: false,
      collection: collection,
      error: message,
    };
  }
}

/**
 * Delete gruene.de content vectors by source URL
 * @param client - Qdrant client instance
 * @param collection - gruene.de collection name
 * @param url - Source URL to delete
 * @param logger - Optional logger instance (defaults to module logger)
 * @returns Delete result with success status
 */
export async function deleteGrueneDeContentByUrl(
  client: QdrantClient,
  collection: string,
  url: string,
  logger: Logger = defaultLogger
): Promise<DeleteResult> {
  try {
    logger.debug(`Deleting gruene.de content for URL: ${url}`);

    const filter: QdrantFilter = {
      must: [{ key: 'source_url', match: { value: url } }],
    };

    await client.delete(collection, {
      filter: filter,
    });

    logger.info(`Deleted gruene.de content from ${collection} for URL: ${url}`);
    return {
      success: true,
      collection: collection,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to delete gruene.de content for URL ${url}: ${message}`);
    return {
      success: false,
      collection: collection,
      error: message,
    };
  }
}

/**
 * Delete gruene.at content vectors by source URL
 * @param client - Qdrant client instance
 * @param collection - gruene.at collection name
 * @param url - Source URL to delete
 * @param logger - Optional logger instance (defaults to module logger)
 * @returns Delete result with success status
 */
export async function deleteGrueneAtContentByUrl(
  client: QdrantClient,
  collection: string,
  url: string,
  logger: Logger = defaultLogger
): Promise<DeleteResult> {
  try {
    logger.debug(`Deleting gruene.at content for URL: ${url}`);

    const filter: QdrantFilter = {
      must: [{ key: 'source_url', match: { value: url } }],
    };

    await client.delete(collection, {
      filter: filter,
    });

    logger.info(`Deleted gruene.at content from ${collection} for URL: ${url}`);
    return {
      success: true,
      collection: collection,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to delete gruene.at content for URL ${url}: ${message}`);
    return {
      success: false,
      collection: collection,
      error: message,
    };
  }
}

/**
 * Delete content example vectors by example_id
 * @param client - Qdrant client instance
 * @param collection - Content examples collection name
 * @param exampleId - Example identifier to delete
 * @param logger - Optional logger instance (defaults to module logger)
 * @returns Delete result with success status
 */
export async function deleteContentExample(
  client: QdrantClient,
  collection: string,
  exampleId: string,
  logger: Logger = defaultLogger
): Promise<DeleteResult> {
  try {
    logger.debug(`Deleting content example ${exampleId} from ${collection}`);

    const filter: QdrantFilter = {
      must: [{ key: 'example_id', match: { value: exampleId } }],
    };

    await client.delete(collection, {
      filter: filter,
    });

    logger.info(`Deleted content example ${exampleId} from ${collection}`);
    return {
      success: true,
      collection: collection,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to delete content example ${exampleId}: ${message}`);
    return {
      success: false,
      collection: collection,
      error: message,
    };
  }
}
