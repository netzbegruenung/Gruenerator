import { promisify } from 'util';
import { gzip, gunzip } from 'zlib';

import { escapeHtml } from '@gruenerator/shared/utils';
import { DOCUMENT_FRAGMENT_NAME, injectHtmlIntoFragment } from '@gruenerator/shared/yjs';
import * as Y from 'yjs';

import { blockNoteXmlToHtml } from './blockNoteXmlToHtml.js';
import {
  boardPreview,
  detectPreviewKind,
  presentationPreviewHtml,
  sheetPreviewHtml,
  type BoardPreview,
} from './contentPreviews.js';
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

// Subtypes whose `content` column stores a BlockNote HTML preview written by
// this service. Boards (and any future polymorphic subtype) share the same
// `collaborative_documents` table but store JSON metadata in `content` and
// must never be overwritten by the preview pipeline. Kept as a readonly tuple
// so adding/removing a subtype is a single-source change; the derived union
// catches accidental string drift at compile time.
//
// Per CLAUDE.md, the Hocuspocus service has zero cross-package deps, so the
// constant is duplicated here intentionally rather than imported.
// 'sheets' (Univer spreadsheets) is intentionally absent: its Y.Doc holds a
// workbook snapshot + mutation log, not a BlockNote fragment, so the HTML
// preview pipeline must never touch it.
const DOC_SUBTYPES = [
  'blank',
  'antrag',
  'pressemitteilung',
  'protokoll',
  'notizen',
  'redaktionsplan',
  'checkliste',
  'einladung',
] as const;
type DocSubtype = (typeof DOC_SUBTYPES)[number];
const DOC_SUBTYPES_PARAM: readonly DocSubtype[] = DOC_SUBTYPES;

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
 * - yjs_document_updates: one full-state row per document (UPSERT on store)
 * - yjs_document_snapshots: periodic snapshots for version history
 */
export class PostgresPersistence {
  private readonly SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly SNAPSHOT_RETENTION_DAYS = 90;
  private readonly MAX_SNAPSHOT_SIZE_ENTRIES = 10_000;
  private readonly db: DbQueryFn;
  private lastSnapshotSizes = new Map<string, number>();
  private snapshotCounter = 0;

  constructor(db: DbQueryFn) {
    this.db = db;
  }

  /**
   * Throws on DB error, and when stored rows exist but none of them can be
   * decoded — serving an empty doc in that case would let the caller inject
   * the template and the next store would overwrite the (still recoverable)
   * real bytes in Postgres. Returns null only for genuinely new documents.
   */
  async loadDocument(documentId: string): Promise<Uint8Array | null> {
    const ydoc = new Y.Doc();

    // Walk snapshots newest-first until one decompresses and applies cleanly.
    let appliedSnapshot: { version: number; created_at: unknown } | null = null;
    let snapshotRowsSeen = 0;
    for (let offset = 0; ; offset++) {
      const rows = await this.db(
        `SELECT snapshot_data, version, created_at
         FROM yjs_document_snapshots
         WHERE document_id = $1
         ORDER BY version DESC
         LIMIT 1 OFFSET $2`,
        [documentId, offset]
      );
      if (rows.length === 0) break;
      snapshotRowsSeen++;

      const snapshot = rows[0];
      try {
        const decompressed = await gunzipAsync(snapshot.snapshot_data as Buffer);
        Y.applyUpdate(ydoc, decompressed);
        appliedSnapshot = snapshot as { version: number; created_at: unknown };
        if (offset > 0) {
          log.warn(
            `[Load] Recovered ${documentId} from older snapshot v${appliedSnapshot.version} (${offset} newer snapshot(s) unreadable)`
          );
        }
        break;
      } catch (error) {
        log.error(
          `[Load] Snapshot v${snapshot.version} for ${documentId} unreadable, trying older: ${error}`
        );
      }
    }

    // Current-state rows (at most one post-migration; the ordered loop also
    // covers pre-migration leftovers). Each row holds a full state, so a row
    // applied on top of an older fallback snapshot self-heals the document.
    const updatesResult = appliedSnapshot
      ? await this.db(
          `SELECT update_data
           FROM yjs_document_updates
           WHERE document_id = $1
             AND created_at > $2
           ORDER BY created_at ASC`,
          [documentId, appliedSnapshot.created_at]
        )
      : await this.db(
          `SELECT update_data
           FROM yjs_document_updates
           WHERE document_id = $1
           ORDER BY created_at ASC`,
          [documentId]
        );

    let appliedUpdates = 0;
    let failedUpdates = 0;
    for (const row of updatesResult) {
      try {
        const decompressed = await gunzipAsync(row.update_data as Buffer);
        Y.applyUpdate(ydoc, decompressed);
        appliedUpdates++;
      } catch (error) {
        failedUpdates++;
        log.error(`[Load] Failed to apply update for ${documentId}: ${error}`);
      }
    }

    if (appliedSnapshot || appliedUpdates > 0) {
      const state = Y.encodeStateAsUpdate(ydoc);
      log.info(`[Load] Document ${documentId} loaded (${state.length} bytes)`);
      return state;
    }

    if (snapshotRowsSeen > 0 || failedUpdates > 0) {
      throw new Error(
        `Stored state for ${documentId} exists but is unreadable (${snapshotRowsSeen} snapshot(s), ${failedUpdates} update(s) failed to decode)`
      );
    }

    // Third tier: API-seeded init_data. Live Yjs state takes precedence;
    // this only fires on first connection after a server-side doc creation.
    const initResult = await this.db(
      'SELECT init_data FROM collaborative_documents_init WHERE document_id = $1',
      [documentId]
    );
    if (initResult.length > 0 && initResult[0].init_data) {
      const decompressed = await gunzipAsync(initResult[0].init_data as Buffer);
      log.info(
        `[Load] Document ${documentId} hydrated from init_data (${decompressed.length} bytes)`
      );
      return decompressed;
    }

    log.info(`[Load] No stored state for ${documentId}`);
    return null;
  }

  async initializeWithTemplate(documentId: string, ydoc: Y.Doc): Promise<void> {
    try {
      const fragment = ydoc.getXmlFragment(DOCUMENT_FRAGMENT_NAME);
      if (fragment.length > 0) {
        log.warn(
          `[Template] Skipped for ${documentId} — fragment already has ${fragment.length} children`
        );
        return;
      }

      const result = await this.db(
        'SELECT document_subtype, content FROM collaborative_documents WHERE id = $1',
        [documentId]
      );
      if (result.length === 0) {
        log.warn(`[Template] No document record found for ${documentId} — skipping`);
        return;
      }

      const subtype = result[0].document_subtype as string;
      const storedContent = result[0].content as string | null;

      const html = storedContent?.trim() || TEMPLATE_CONTENT[subtype];
      if (!html) {
        log.info(
          `[Template] No content or template for subtype '${subtype}' on ${documentId} — skipping`
        );
        return;
      }

      injectHtmlIntoFragment(fragment, html);

      // Fallback for legacy docs whose `content` is plaintext (or markup the
      // parser doesn't recognize): wrap each paragraph as <p> and retry, so
      // the editor isn't blank when init_data is also missing.
      if (fragment.length === 0 && storedContent?.trim()) {
        const escaped = escapeHtml(storedContent.trim());
        const paragraphs = escaped.split(/\n\s*\n+/).filter(Boolean);
        const wrapped =
          paragraphs.length > 0
            ? paragraphs.map((p) => `<p>${p.replace(/\n/g, ' ')}</p>`).join('')
            : `<p>${escaped}</p>`;
        injectHtmlIntoFragment(fragment, wrapped);
        log.warn(
          `[Template] HTML parse no-op for ${documentId}; recovered as ${fragment.length} plain-text block(s)`
        );
      } else {
        log.info(
          `[Template] Injected ${storedContent ? 'stored content' : `'${subtype}' template`} for ${documentId} (${fragment.length} blocks)`
        );
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error(`[Template] Error injecting template for ${documentId}: ${err.message}`);
    }
  }

  async storeDocument(documentId: string, state: Uint8Array): Promise<void> {
    try {
      const compressed = await gzipAsync(state);

      // `state` is the full document, so a single row per document suffices —
      // appending would pile up redundant full copies between snapshots.
      await this.db(
        `INSERT INTO yjs_document_updates (document_id, update_data, created_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT (document_id) DO UPDATE
           SET update_data = EXCLUDED.update_data, created_at = EXCLUDED.created_at`,
        [documentId, compressed]
      );

      log.debug(`[Store] Stored update for ${documentId} (${compressed.length} bytes compressed)`);

      await this.maybeCreateSnapshot(documentId, state);
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

        // Crude bound so the map can't grow with every doc ever touched.
        if (this.lastSnapshotSizes.size >= this.MAX_SNAPSHOT_SIZE_ENTRIES) {
          this.lastSnapshotSizes.clear();
        }
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

  async touchUpdatedAt(documentId: string): Promise<void> {
    try {
      await this.db(
        'UPDATE collaborative_documents SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [documentId]
      );
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.debug(`[Touch] Failed to touch updated_at for ${documentId}: ${err.message}`);
    }
  }

  async updateContentPreview(documentId: string, ydoc: Y.Doc): Promise<void> {
    try {
      const kind = detectPreviewKind(ydoc);

      if (kind !== 'blocknote') {
        await this.storeTypedPreview(documentId, ydoc, kind);
        return;
      }

      const fragment = ydoc.getXmlFragment(DOCUMENT_FRAGMENT_NAME);
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
          `UPDATE collaborative_documents
           SET content = $2, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1
             AND document_subtype = ANY($3::text[])
             AND content IS DISTINCT FROM $2`,
          [documentId, preview, DOC_SUBTYPES_PARAM]
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

  /** Sheets/presentations/board previews, shared by live store and backfill. */
  private async storeTypedPreview(
    documentId: string,
    ydoc: Y.Doc,
    kind: 'sheets' | 'presentations' | 'board'
  ): Promise<string | null> {
    if (kind === 'board') {
      const preview = boardPreview(ydoc);
      if (!preview) return null;
      await this.mergeBoardPreview(documentId, preview);
      return JSON.stringify(preview);
    }

    const preview = kind === 'sheets' ? sheetPreviewHtml(ydoc) : presentationPreviewHtml(ydoc);
    if (!preview) return null;
    await this.db(
      `UPDATE collaborative_documents
       SET content = $2
       WHERE id = $1
         AND document_subtype = $3
         AND content IS DISTINCT FROM $2`,
      [documentId, preview, kind]
    );
    log.debug(`[Preview] Updated ${kind} preview for ${documentId} (${preview.length} chars)`);
    return preview;
  }

  /**
   * Boards keep `{ board_type, is_archived }` JSON in `content`, so the
   * preview is merged into that object instead of replacing the column.
   * Non-JSON legacy content is treated as absent.
   */
  private async mergeBoardPreview(documentId: string, preview: BoardPreview): Promise<void> {
    const rows = (await this.db(
      `SELECT content FROM collaborative_documents WHERE id = $1 AND document_subtype = 'boards'`,
      [documentId]
    )) as Array<{ content: string | null }>;
    if (rows.length === 0) return;

    let meta: Record<string, unknown> = {};
    const current = rows[0].content;
    if (current) {
      try {
        const parsed = JSON.parse(current) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          meta = parsed as Record<string, unknown>;
        }
      } catch {
        /* legacy non-JSON content — replace with a fresh metadata object */
      }
    }

    const next = JSON.stringify({ ...meta, preview });
    if (next === current) return;
    await this.db(
      `UPDATE collaborative_documents SET content = $2 WHERE id = $1 AND document_subtype = 'boards'`,
      [documentId, next]
    );
    log.debug(`[Preview] Updated board preview for ${documentId}`);
  }

  async extractContentPreview(documentId: string): Promise<string | null> {
    try {
      const state = await this.loadDocument(documentId);
      if (!state || state.length === 0) return null;

      const ydoc = new Y.Doc();
      Y.applyUpdate(ydoc, state);

      const kind = detectPreviewKind(ydoc);
      if (kind !== 'blocknote') {
        return await this.storeTypedPreview(documentId, ydoc, kind);
      }

      const fragment = ydoc.getXmlFragment(DOCUMENT_FRAGMENT_NAME);
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
        await this.db(
          `UPDATE collaborative_documents
           SET content = $2
           WHERE id = $1
             AND document_subtype = ANY($3::text[])
             AND content IS DISTINCT FROM $2`,
          [documentId, preview, DOC_SUBTYPES_PARAM]
        );
        log.debug(`[Backfill] Extracted preview for ${documentId} (${preview.length} chars)`);
      }

      return preview || null;
    } catch (error) {
      log.debug(`[Backfill] Failed to extract preview for ${documentId}: ${error}`);
      return null;
    }
  }

  /**
   * Boot-safe variant of the full backfill: only sheets/presentations whose
   * `content` preview was never written and boards whose metadata lacks a
   * preview. Idempotent — once previews exist the query matches nothing, so
   * this runs on every start without the HOCUSPOCUS_BACKFILL_PREVIEWS flag.
   */
  async backfillMissingTypedPreviews(): Promise<void> {
    try {
      const docs = await this.db(
        `SELECT id FROM collaborative_documents
         WHERE is_deleted = false
           AND (
             (document_subtype IN ('sheets', 'presentations') AND COALESCE(content, '') = '')
             OR (document_subtype = 'boards' AND COALESCE(content, '') NOT LIKE '%"preview"%')
           )
         LIMIT 500`,
        []
      );
      if (docs.length === 0) return;

      log.info(`[Backfill] ${docs.length} documents without typed preview — extracting`);
      let updated = 0;
      for (const doc of docs) {
        const result = await this.extractContentPreview(doc.id as string);
        if (result) updated++;
      }
      log.info(`[Backfill] Typed previews: ${updated}/${docs.length} regenerated`);
    } catch (error) {
      log.error(`[Backfill] Failed to backfill typed previews: ${error}`);
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
