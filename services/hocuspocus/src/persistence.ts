import { promisify } from 'util';
import { gzip, gunzip } from 'zlib';

import * as Y from 'yjs';

import { blockNoteXmlToHtml } from './blockNoteXmlToHtml.js';
import { injectHtmlIntoFragment } from './htmlToYjsXml.js';
import { createLogger } from './logger.js';
import { TEMPLATE_CONTENT } from './templateContent.js';

import type { DbQueryFn } from './types.js';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const log = createLogger('PostgresPersistence');

const DEFAULT_TITLES = new Set([
  'Neues Dokument',
  'Neuer Antrag',
  'Neue Pressemitteilung',
  'Neues Protokoll',
  'Neue Notiz',
  'Neuer Redaktionsplan',
  'Untitled Document',
]);

/**
 * Extract a title from the first heading or paragraph in HTML output.
 * Returns null if no usable text is found.
 */
function extractAutoTitle(html: string): string | null {
  const headingMatch = html.match(/<h[123][^>]*>(.*?)<\/h[123]>/);
  if (headingMatch) {
    const text = headingMatch[1].replace(/<[^>]+>/g, '').trim();
    if (text) return text.slice(0, 200);
  }
  const pMatch = html.match(/<p[^>]*>(.*?)<\/p>/);
  if (pMatch) {
    const text = pMatch[1].replace(/<[^>]+>/g, '').trim();
    if (text) return text.slice(0, 100);
  }
  return null;
}

/**
 * PostgreSQL Persistence Adapter for Y.js Documents
 *
 * Stores Y.js documents in PostgreSQL using existing tables:
 * - yjs_document_updates: Incremental updates
 * - yjs_document_snapshots: Periodic snapshots for fast loading
 */
export class PostgresPersistence {
  private readonly UPDATE_BATCH_SIZE = 100;
  private readonly SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly SNAPSHOT_RETENTION_DAYS = 90;
  private readonly db: DbQueryFn;
  private lastSnapshotSizes = new Map<string, number>();
  private snapshotCounter = 0;

  constructor(db: DbQueryFn) {
    this.db = db;
  }

  /** Throws on DB error — callers must handle. Returns null only for genuinely new documents. */
  async loadDocument(documentId: string): Promise<Uint8Array | null> {
    const snapshotResult = await this.db(
      `SELECT snapshot_data, version, created_at
       FROM yjs_document_snapshots
       WHERE document_id = $1
       ORDER BY version DESC
       LIMIT 1`,
      [documentId]
    );

    if (snapshotResult.length > 0) {
      const snapshot = snapshotResult[0];
      log.debug(`[Load] Found snapshot for ${documentId}, version ${snapshot.version}`);

      const ydoc = new Y.Doc();

      try {
        const decompressed = await gunzipAsync(snapshot.snapshot_data as Buffer);
        Y.applyUpdate(ydoc, decompressed);
        log.debug(`[Load] Applied snapshot (${decompressed.length} bytes)`);
      } catch (error) {
        log.error(`[Load] Failed to decompress/apply snapshot: ${error}`);
      }

      const updatesResult = await this.db(
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

      const state = Y.encodeStateAsUpdate(ydoc);
      log.info(`[Load] Document ${documentId} loaded (${state.length} bytes)`);
      return state;
    }

    const updatesResult = await this.db(
      `SELECT update_data
       FROM yjs_document_updates
       WHERE document_id = $1
       ORDER BY created_at ASC`,
      [documentId]
    );

    if (updatesResult.length === 0) {
      log.info(`[Load] No stored state for ${documentId}`);
      return null;
    }

    log.debug(`[Load] Found ${updatesResult.length} total updates (no snapshot)`);

    const ydoc = new Y.Doc();

    for (const row of updatesResult) {
      try {
        const decompressed = await gunzipAsync(row.update_data as Buffer);
        Y.applyUpdate(ydoc, decompressed);
      } catch (error) {
        log.error(`[Load] Failed to apply update: ${error}`);
      }
    }

    const state = Y.encodeStateAsUpdate(ydoc);
    log.info(`[Load] Document ${documentId} loaded (${state.length} bytes)`);
    return state;
  }

  async initializeWithTemplate(documentId: string, ydoc: Y.Doc): Promise<void> {
    try {
      const fragment = ydoc.getXmlFragment('document-store');
      if (fragment.length > 0) {
        log.warn(
          `[Template] Skipped for ${documentId} — fragment already has ${fragment.length} children`
        );
        return;
      }

      const result = await this.db(
        'SELECT document_subtype FROM collaborative_documents WHERE id = $1',
        [documentId]
      );
      if (result.length === 0) {
        log.warn(`[Template] No document record found for ${documentId} — skipping`);
        return;
      }

      const subtype = result[0].document_subtype as string;
      const html = TEMPLATE_CONTENT[subtype];
      if (!html) {
        log.info(`[Template] No template for subtype '${subtype}' on ${documentId} — skipping`);
        return;
      }

      injectHtmlIntoFragment(fragment, html);
      log.info(
        `[Template] Injected '${subtype}' template for ${documentId} (${fragment.length} blocks)`
      );
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error(`[Template] Error injecting template for ${documentId}: ${err.message}`);
    }
  }

  async storeDocument(documentId: string, state: Uint8Array): Promise<void> {
    try {
      const compressed = await gzipAsync(state);

      await this.db(
        `INSERT INTO yjs_document_updates (document_id, update_data, created_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP)`,
        [documentId, compressed]
      );

      log.debug(`[Store] Stored update for ${documentId} (${compressed.length} bytes compressed)`);

      await this.maybeCreateSnapshot(documentId, state);
      await this.cleanupOldUpdates(documentId);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error(`[Store] Error storing document ${documentId}: ${err.message}`);
      throw err;
    }
  }

  private async maybeCreateSnapshot(documentId: string, state: Uint8Array): Promise<void> {
    try {
      // Skip if document state hasn't meaningfully changed
      const lastSize = this.lastSnapshotSizes.get(documentId);
      if (lastSize !== undefined && Math.abs(state.length - lastSize) < 50) {
        return;
      }

      const result = await this.db(
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
        const compressed = await gzipAsync(state);

        await this.db(
          `INSERT INTO yjs_document_snapshots (document_id, snapshot_data, version, created_at, is_auto_save)
           VALUES ($1, $2, $3, CURRENT_TIMESTAMP, true)`,
          [documentId, compressed, nextVersion]
        );

        this.lastSnapshotSizes.set(documentId, state.length);
        log.info(`[Snapshot] Created snapshot for ${documentId}, version ${nextVersion}`);

        this.snapshotCounter++;
        if (this.snapshotCounter % 100 === 0) {
          this.cleanupOldSnapshots().catch((err) => {
            log.error(`[Cleanup] Snapshot retention cleanup failed: ${err}`);
          });
        }
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error(`[Snapshot] Error creating snapshot: ${err.message}`);
    }
  }

  private async cleanupOldSnapshots(): Promise<void> {
    try {
      const result = await this.db(
        `DELETE FROM yjs_document_snapshots
         WHERE is_auto_save = true
           AND label IS NULL
           AND created_at < CURRENT_TIMESTAMP - interval '${this.SNAPSHOT_RETENTION_DAYS} days'
         RETURNING id`,
        []
      );
      if (result.length > 0) {
        log.info(
          `[Cleanup] Deleted ${result.length} auto-snapshots older than ${this.SNAPSHOT_RETENTION_DAYS} days`
        );
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error(`[Cleanup] Error cleaning old snapshots: ${err.message}`);
    }
  }

  private async cleanupOldUpdates(documentId: string): Promise<void> {
    try {
      const snapshotResult = await this.db(
        `SELECT created_at
         FROM yjs_document_snapshots
         WHERE document_id = $1
         ORDER BY version DESC
         LIMIT 1`,
        [documentId]
      );

      if (snapshotResult.length > 0) {
        const deleteResult = await this.db(
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
    }
  }

  async updateContentPreview(documentId: string, ydoc: Y.Doc): Promise<void> {
    try {
      const fragment = ydoc.getXmlFragment('document-store');
      const xml = fragment.toString();
      log.debug(`[Preview] Raw XML (first 200): ${xml.slice(0, 200)}`);

      // Try HTML conversion first, fall back to plain text
      let preview = blockNoteXmlToHtml(xml).slice(0, 2000);
      if (!preview) {
        preview = xml
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 2000);
      }

      if (preview) {
        await this.db(
          'UPDATE collaborative_documents SET content = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
          [documentId, preview]
        );
        log.debug(`[Preview] Updated preview for ${documentId} (${preview.length} chars)`);

        const autoTitle = extractAutoTitle(preview);
        if (autoTitle) {
          const result = await this.db(
            `UPDATE collaborative_documents
             SET title = $2
             WHERE id = $1 AND title = ANY($3::text[])
             RETURNING id`,
            [documentId, autoTitle, [...DEFAULT_TITLES]]
          );
          if (result.length > 0) {
            log.info(`[AutoTitle] Renamed document ${documentId} to "${autoTitle}"`);
          }
        }
      }
    } catch (error) {
      log.debug(`[Preview] Failed to update content preview for ${documentId}: ${error}`);
    }
  }

  async extractContentPreview(documentId: string): Promise<string | null> {
    try {
      const state = await this.loadDocument(documentId);
      if (!state || state.length === 0) return null;

      const ydoc = new Y.Doc();
      Y.applyUpdate(ydoc, state);

      const fragment = ydoc.getXmlFragment('document-store');
      const xml = fragment.toString();

      // Try HTML conversion first, fall back to plain text
      let preview = blockNoteXmlToHtml(xml).slice(0, 2000);
      if (!preview) {
        preview = xml
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 2000);
      }

      if (preview) {
        await this.db('UPDATE collaborative_documents SET content = $2 WHERE id = $1', [
          documentId,
          preview,
        ]);
        log.debug(`[Backfill] Extracted preview for ${documentId} (${preview.length} chars)`);
      }

      return preview || null;
    } catch (error) {
      log.debug(`[Backfill] Failed to extract preview for ${documentId}: ${error}`);
      return null;
    }
  }

  async backfillAllPreviews(): Promise<void> {
    try {
      const docs = await this.db(`SELECT id FROM collaborative_documents WHERE is_deleted = false`);
      log.info(`[Backfill] Starting preview backfill for ${docs.length} documents`);

      let updated = 0;
      for (const doc of docs) {
        const result = await this.extractContentPreview(doc.id as string);
        if (result) updated++;
      }

      log.info(`[Backfill] Completed: ${updated}/${docs.length} previews regenerated`);
    } catch (error) {
      log.error(`[Backfill] Failed to backfill previews: ${error}`);
    }
  }

  async createManualSnapshot(
    documentId: string,
    state: Uint8Array,
    userId: string,
    label?: string
  ): Promise<number> {
    try {
      const result = await this.db(
        `SELECT COALESCE(MAX(version), 0) + 1 as next_version
         FROM yjs_document_snapshots
         WHERE document_id = $1`,
        [documentId]
      );

      const nextVersion = result[0].next_version;
      const compressed = await gzipAsync(state);

      await this.db(
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

  async getDocumentAtVersion(documentId: string, version: number): Promise<Uint8Array | null> {
    try {
      const result = await this.db(
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
