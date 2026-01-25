import * as Y from 'yjs';
import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';
import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { createLogger } from '../../utils/logger.js';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const log = createLogger('PostgresPersistence');
const db = getPostgresInstance();

/**
 * PostgreSQL Persistence Adapter for Y.js Documents
 *
 * Stores Y.js documents in PostgreSQL using existing tables:
 * - yjs_document_updates: Incremental updates
 * - yjs_document_snapshots: Periodic snapshots for fast loading
 */
export class PostgresPersistence {
  private readonly UPDATE_BATCH_SIZE = 100;
  private readonly SNAPSHOT_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

  /**
   * Load document from database
   * Returns the latest snapshot + any subsequent updates
   */
  async loadDocument(documentId: string): Promise<Uint8Array | null> {
    try {
      // 1. Load latest snapshot
      const snapshotResult = await db.query(
        `SELECT snapshot_data, version, created_at
         FROM yjs_document_snapshots
         WHERE document_id = $1
         ORDER BY version DESC
         LIMIT 1`,
        [documentId]
      );

      const ydoc = new Y.Doc();

      // If snapshot exists, apply it
      if (snapshotResult.length > 0) {
        const snapshot = snapshotResult[0];
        log.debug(`[Load] Found snapshot for ${documentId}, version ${snapshot.version}`);

        try {
          // Decompress snapshot
          const decompressed = await gunzipAsync(snapshot.snapshot_data as Buffer);
          Y.applyUpdate(ydoc, decompressed);
          log.debug(`[Load] Applied snapshot (${decompressed.length} bytes)`);
        } catch (error) {
          log.error(`[Load] Failed to decompress/apply snapshot: ${error}`);
          // Continue without snapshot - will load from updates
        }

        // 2. Load updates since snapshot
        const updatesResult = await db.query(
          `SELECT update_data
           FROM yjs_document_updates
           WHERE document_id = $1
             AND created_at > $2
           ORDER BY created_at ASC`,
          [documentId, snapshot.created_at]
        );

        log.debug(`[Load] Found ${updatesResult.length} updates after snapshot`);

        for (const row of updatesResult) {
          try {
            const decompressed = await gunzipAsync(row.update_data as Buffer);
            Y.applyUpdate(ydoc, decompressed);
          } catch (error) {
            log.error(`[Load] Failed to apply update: ${error}`);
          }
        }
      } else {
        // No snapshot - load all updates from beginning
        log.debug(`[Load] No snapshot found for ${documentId}, loading all updates`);

        const updatesResult = await db.query(
          `SELECT update_data
           FROM yjs_document_updates
           WHERE document_id = $1
           ORDER BY created_at ASC`,
          [documentId]
        );

        log.debug(`[Load] Found ${updatesResult.length} total updates`);

        for (const row of updatesResult) {
          try {
            const decompressed = await gunzipAsync(row.update_data as Buffer);
            Y.applyUpdate(ydoc, decompressed);
          } catch (error) {
            log.error(`[Load] Failed to apply update: ${error}`);
          }
        }
      }

      // Return encoded document state
      const state = Y.encodeStateAsUpdate(ydoc);
      log.info(`[Load] Document ${documentId} loaded (${state.length} bytes)`);
      return state;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error(`[Load] Error loading document ${documentId}: ${err.message}`);
      return null;
    }
  }

  /**
   * Store document update to database
   * Creates both incremental update and periodic snapshots
   */
  async storeDocument(documentId: string, state: Uint8Array): Promise<void> {
    try {
      // Compress the update
      const compressed = await gzipAsync(state);

      // Store as incremental update
      await db.query(
        `INSERT INTO yjs_document_updates (document_id, update_data, created_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP)`,
        [documentId, compressed]
      );

      log.debug(`[Store] Stored update for ${documentId} (${compressed.length} bytes compressed)`);

      // Check if we should create a snapshot
      await this.maybeCreateSnapshot(documentId, state);

      // Clean up old updates
      await this.cleanupOldUpdates(documentId);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error(`[Store] Error storing document ${documentId}: ${err.message}`);
      throw err;
    }
  }

  /**
   * Create a snapshot if enough time has passed since last snapshot
   */
  private async maybeCreateSnapshot(documentId: string, state: Uint8Array): Promise<void> {
    try {
      // Get latest snapshot timestamp
      const result = await db.query(
        `SELECT created_at, version
         FROM yjs_document_snapshots
         WHERE document_id = $1
         ORDER BY version DESC
         LIMIT 1`,
        [documentId]
      );

      const shouldCreateSnapshot =
        result.length === 0 ||
        Date.now() - new Date(result[0].created_at as string).getTime() > this.SNAPSHOT_INTERVAL_MS;

      if (shouldCreateSnapshot) {
        const nextVersion = result.length > 0 ? (result[0].version as number) + 1 : 1;

        // Compress snapshot
        const compressed = await gzipAsync(state);

        await db.query(
          `INSERT INTO yjs_document_snapshots (document_id, snapshot_data, version, created_at, is_auto_save)
           VALUES ($1, $2, $3, CURRENT_TIMESTAMP, true)`,
          [documentId, compressed, nextVersion]
        );

        log.info(`[Snapshot] Created snapshot for ${documentId}, version ${nextVersion}`);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error(`[Snapshot] Error creating snapshot: ${err.message}`);
      // Don't throw - snapshot creation is not critical
    }
  }

  /**
   * Clean up old updates after successful snapshot
   * Keep only recent updates (since last snapshot)
   */
  private async cleanupOldUpdates(documentId: string): Promise<void> {
    try {
      // Get latest snapshot timestamp
      const snapshotResult = await db.query(
        `SELECT created_at
         FROM yjs_document_snapshots
         WHERE document_id = $1
         ORDER BY version DESC
         LIMIT 1`,
        [documentId]
      );

      if (snapshotResult.length > 0) {
        // Delete updates older than the snapshot (they're redundant)
        const deleteResult = await db.query(
          `DELETE FROM yjs_document_updates
           WHERE document_id = $1
             AND created_at < $2
           RETURNING id`,
          [documentId, snapshotResult[0].created_at]
        );

        if (deleteResult.length > 0) {
          log.debug(`[Cleanup] Deleted ${deleteResult.length} old updates for ${documentId}`);
        }
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error(`[Cleanup] Error cleaning up old updates: ${err.message}`);
      // Don't throw - cleanup is not critical
    }
  }

  /**
   * Create a manual snapshot (for version history)
   */
  async createManualSnapshot(
    documentId: string,
    state: Uint8Array,
    userId: string,
    label?: string
  ): Promise<number> {
    try {
      // Get next version number
      const result = await db.query(
        `SELECT COALESCE(MAX(version), 0) + 1 as next_version
         FROM yjs_document_snapshots
         WHERE document_id = $1`,
        [documentId]
      );

      const nextVersion = result[0].next_version;

      // Compress snapshot
      const compressed = await gzipAsync(state);

      // Insert snapshot
      await db.query(
        `INSERT INTO yjs_document_snapshots
          (document_id, snapshot_data, version, created_at, is_auto_save, label, created_by)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP, false, $4, $5)`,
        [documentId, compressed, nextVersion, label || null, userId]
      );

      log.info(
        `[Manual Snapshot] Created version ${nextVersion} for ${documentId}: ${label || 'unlabeled'}`
      );
      return nextVersion as number;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error(`[Manual Snapshot] Error creating snapshot: ${err.message}`);
      throw err;
    }
  }

  /**
   * Get document state at specific version
   */
  async getDocumentAtVersion(documentId: string, version: number): Promise<Uint8Array | null> {
    try {
      const result = await db.query(
        `SELECT snapshot_data
         FROM yjs_document_snapshots
         WHERE document_id = $1 AND version = $2`,
        [documentId, version]
      );

      if (result.length === 0) {
        return null;
      }

      const decompressed = await gunzipAsync(result[0].snapshot_data as Buffer);
      return decompressed;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error(`[Get Version] Error getting version ${version}: ${err.message}`);
      return null;
    }
  }
}
