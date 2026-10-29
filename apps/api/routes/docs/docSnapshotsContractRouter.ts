/**
 * ts-rest server for docSnapshotsContract — the docs version history.
 *
 * Snapshots are gzipped full Yjs states in `yjs_document_snapshots`: written
 * every few minutes by Hocuspocus, on demand here, and before every restore.
 * Restoring writes to the live document through the Hocuspocus internal API,
 * which bypasses its connection auth — so the write check below must be the
 * one Hocuspocus applies (`checkDocumentWriteAccess` mirrors it).
 */
import { gunzipSync, gzipSync } from 'zlib';

import { docSnapshotsContract, type DocSnapshot } from '@gruenerator/contracts';
import { blockNoteXmlToHtml } from '@gruenerator/hocuspocus';
import { createExpressEndpoints, initServer } from '@ts-rest/express';
import * as Y from 'yjs';

import { type YjsDocumentSnapshotRow } from '../../database/schema/yjs.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { fragmentToSafeXml } from '../../services/docs/fragmentToSafeXml.js';
import {
  applyToLive,
  buildRestore,
  DOC_FRAGMENT,
  readLiveState,
} from '../../services/docs/snapshotRestore.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { createLogger } from '../../utils/logger.js';

import { DOCS_SUBTYPES } from './constants.js';
import {
  checkDocumentAccess,
  checkDocumentWriteAccess,
  type DocumentAccessSubject,
} from './documentAccess.js';

import type { Application } from 'express';

const log = createLogger('docSnapshotsContractRouter');
const db = getPostgresInstance();
const s = initServer();

const GROUP_WINDOW_MS = 30 * 60 * 1000;
const PAGE_SIZE = 50;

type SnapshotListRow = Pick<
  YjsDocumentSnapshotRow,
  'id' | 'version' | 'created_at' | 'is_auto_save' | 'label' | 'created_by'
> & { created_by_name: string | null };

/** pg hands timestamptz back as a Date; the wire format is an ISO string. */
const toIso = (value: Date | string | null): string =>
  value === null ? new Date(0).toISOString() : new Date(value).toISOString();

type Denied = { status: 401 | 403 | 404; body: { error: string } };

/**
 * Loads the document (docs subtypes only) and checks read, or write access as
 * Hocuspocus grants it. Returns the user id, or the response to send.
 */
async function authorize(
  userId: string | undefined,
  documentId: string,
  need: 'read' | 'write'
): Promise<{ userId: string } | Denied> {
  if (!userId) return { status: 401, body: { error: 'User not authenticated' } };

  const rows = (await db.query(
    `SELECT id, created_by, permissions, is_public, share_mode
     FROM collaborative_documents
     WHERE id = $1 AND is_deleted = false AND document_subtype = ANY($2::text[])`,
    [documentId, DOCS_SUBTYPES]
  )) as DocumentAccessSubject[];
  if (rows.length === 0) return { status: 404, body: { error: 'Document not found' } };

  if (need === 'write') {
    return (await checkDocumentWriteAccess(documentId, userId))
      ? { userId }
      : { status: 403, body: { error: 'Edit permission required' } };
  }
  const { hasAccess } = await checkDocumentAccess(rows[0], userId);
  return hasAccess ? { userId } : { status: 403, body: { error: 'Access denied' } };
}

const denied = (result: { userId: string } | Denied): result is Denied => 'status' in result;

async function insertSnapshot(
  documentId: string,
  state: Uint8Array,
  label: string | null,
  userId: string
): Promise<{ version: number; created_at: string }> {
  const rows = (await db.query(
    `INSERT INTO yjs_document_snapshots
       (document_id, snapshot_data, version, created_at, is_auto_save, label, created_by)
     VALUES (
       $1, $2,
       (SELECT COALESCE(MAX(version), 0) + 1 FROM yjs_document_snapshots WHERE document_id = $1),
       CURRENT_TIMESTAMP, false, $3, $4
     )
     RETURNING version, created_at`,
    [documentId, gzipSync(Buffer.from(state)), label, userId]
  )) as Pick<YjsDocumentSnapshotRow, 'version' | 'created_at'>[];
  return { version: rows[0].version, created_at: toIso(rows[0].created_at) };
}

async function readSnapshotState(documentId: string, version: number): Promise<Uint8Array | null> {
  const rows = (await db.query(
    `SELECT snapshot_data FROM yjs_document_snapshots WHERE document_id = $1 AND version = $2`,
    [documentId, version]
  )) as Pick<YjsDocumentSnapshotRow, 'snapshot_data'>[];
  return rows.length === 0 ? null : new Uint8Array(gunzipSync(rows[0].snapshot_data));
}

/** Last persisted state: newest snapshot plus the state row written after it. */
async function readStoredState(documentId: string): Promise<Uint8Array> {
  const snapshots = (await db.query(
    `SELECT snapshot_data, created_at
     FROM yjs_document_snapshots WHERE document_id = $1
     ORDER BY version DESC LIMIT 1`,
    [documentId]
  )) as Pick<YjsDocumentSnapshotRow, 'snapshot_data' | 'created_at'>[];

  const ydoc = new Y.Doc();
  if (snapshots.length > 0) {
    Y.applyUpdate(ydoc, gunzipSync(snapshots[0].snapshot_data));
    const updates = (await db.query(
      `SELECT update_data FROM yjs_document_updates
       WHERE document_id = $1 AND created_at > $2
       ORDER BY created_at ASC`,
      [documentId, snapshots[0].created_at]
    )) as { update_data: Buffer }[];
    for (const u of updates) Y.applyUpdate(ydoc, gunzipSync(u.update_data));
  }
  const state = Y.encodeStateAsUpdate(ydoc);
  ydoc.destroy();
  return state;
}

/**
 * The document as collaborators see it right now. Hocuspocus holds edits it
 * has not stored yet (its store is debounced), so a version saved from
 * Postgres alone could miss the last seconds of typing.
 */
async function readCurrentState(documentId: string): Promise<Uint8Array> {
  try {
    return await readLiveState(documentId);
  } catch (error: unknown) {
    log.warn('[readCurrentState] Live state unavailable, saving the stored state instead:', error);
    return readStoredState(documentId);
  }
}

/** Newest first; consecutive unnamed auto-saves within 30 minutes collapse into the newest. */
function groupAutoSaves(rows: SnapshotListRow[]): DocSnapshot[] {
  const result: Array<DocSnapshot & { earliest: number }> = [];
  for (const row of rows) {
    const createdAt = new Date(row.created_at ?? 0).getTime();
    const prev = result[result.length - 1];
    if (
      prev &&
      prev.is_auto_save &&
      row.is_auto_save &&
      !prev.label &&
      !row.label &&
      prev.earliest - createdAt < GROUP_WINDOW_MS
    ) {
      prev.snapshot_count++;
      prev.earliest = createdAt;
      continue;
    }
    result.push({ ...toSnapshot(row), earliest: createdAt });
  }
  return result.map(({ earliest: _earliest, ...snapshot }) => snapshot);
}

function toSnapshot(row: SnapshotListRow): DocSnapshot {
  return {
    id: row.id,
    version: row.version,
    created_at: toIso(row.created_at),
    is_auto_save: row.is_auto_save ?? true,
    label: row.label,
    created_by: row.created_by,
    created_by_name: row.created_by_name,
    snapshot_count: 1,
  };
}

/**
 * One page of the history, newest first, starting at version `cursor`.
 * Reads on until the entry after the page has begun, so an auto-save group
 * at the end of a page is complete; that entry's version is the next cursor.
 */
async function readSnapshotPage(
  documentId: string,
  cursor: number | null,
  limit: number,
  grouped: boolean
): Promise<{ snapshots: DocSnapshot[]; next_cursor: string | null }> {
  const rows: SnapshotListRow[] = [];
  let from = cursor;
  for (;;) {
    const batch = (await db.query(
      `SELECT s.id, s.version, s.created_at, s.is_auto_save, s.label, s.created_by,
              p.display_name AS created_by_name
       FROM yjs_document_snapshots s
       LEFT JOIN profiles p ON s.created_by = p.id
       WHERE s.document_id = $1 AND ($2::int IS NULL OR s.version <= $2)
       ORDER BY s.version DESC
       LIMIT $3`,
      [documentId, from, limit + 1]
    )) as SnapshotListRow[];
    rows.push(...batch);
    const entries = grouped ? groupAutoSaves(rows) : rows.map(toSnapshot);
    if (entries.length > limit) {
      return { snapshots: entries.slice(0, limit), next_cursor: String(entries[limit].version) };
    }
    if (batch.length <= limit) return { snapshots: entries, next_cursor: null };
    from = batch[batch.length - 1].version - 1;
  }
}

export const docSnapshotsContractRouter = s.router(docSnapshotsContract, {
  list: async ({ req, params, query }) => {
    try {
      const access = await authorize(req.user?.id, params.id, 'read');
      if (denied(access)) return access;

      const page = await readSnapshotPage(
        params.id,
        query.cursor ?? null,
        query.limit ?? PAGE_SIZE,
        query.grouped !== 'false'
      );
      return { status: 200, body: page };
    } catch (error) {
      log.error('[list] Error:', error);
      return { status: 500, body: { error: 'Failed to list snapshots' } };
    }
  },

  create: async ({ req, params, body }) => {
    try {
      const access = await authorize(req.user?.id, params.id, 'write');
      if (denied(access)) return access;

      const created = await insertSnapshot(
        params.id,
        await readCurrentState(params.id),
        body?.label || null,
        access.userId
      );
      return { status: 201, body: created };
    } catch (error) {
      log.error('[create] Error:', error);
      return { status: 500, body: { error: 'Failed to create snapshot' } };
    }
  },

  getContent: async ({ req, params }) => {
    try {
      const access = await authorize(req.user?.id, params.id, 'read');
      if (denied(access)) return access;

      const state = await readSnapshotState(params.id, params.version);
      if (!state) return { status: 404, body: { error: 'Snapshot not found' } };
      return {
        status: 200,
        body: { version: params.version, update: Buffer.from(state).toString('base64') },
      };
    } catch (error) {
      log.error('[getContent] Error:', error);
      return { status: 500, body: { error: 'Failed to read snapshot' } };
    }
  },

  getPreview: async ({ req, params }) => {
    try {
      const access = await authorize(req.user?.id, params.id, 'read');
      if (denied(access)) return access;

      const rows = (await db.query(
        `SELECT snapshot_data, created_at FROM yjs_document_snapshots
         WHERE document_id = $1 AND version = $2`,
        [params.id, params.version]
      )) as Pick<YjsDocumentSnapshotRow, 'snapshot_data' | 'created_at'>[];
      if (rows.length === 0) return { status: 404, body: { error: 'Snapshot not found' } };

      const ydoc = new Y.Doc();
      Y.applyUpdate(ydoc, gunzipSync(rows[0].snapshot_data));
      // Rendered via dangerouslySetInnerHTML in old tabs' VersionHistory — never
      // pass the raw fragment.toString(), it escapes nothing (88e17067c3).
      const html = blockNoteXmlToHtml(fragmentToSafeXml(ydoc.getXmlFragment(DOC_FRAGMENT)));
      ydoc.destroy();
      return {
        status: 200,
        body: { version: params.version, html, created_at: toIso(rows[0].created_at) },
      };
    } catch (error) {
      log.error('[getPreview] Error:', error);
      return { status: 500, body: { error: 'Failed to get snapshot preview' } };
    }
  },

  rename: async ({ req, params, body }) => {
    try {
      const access = await authorize(req.user?.id, params.id, 'write');
      if (denied(access)) return access;

      const updated = (await db.query(
        `UPDATE yjs_document_snapshots SET label = $3
         WHERE document_id = $1 AND version = $2
         RETURNING version`,
        [params.id, params.version, body.label || null]
      )) as Pick<YjsDocumentSnapshotRow, 'version'>[];
      if (updated.length === 0) return { status: 404, body: { error: 'Snapshot not found' } };
      return { status: 200, body: { success: true } };
    } catch (error) {
      log.error('[rename] Error:', error);
      return { status: 500, body: { error: 'Failed to rename snapshot' } };
    }
  },

  /**
   * Saves the current content first ("Vor der Wiederherstellung"), so a
   * restore can always be taken back from the history. With `apply: 'live'`
   * the version then becomes a forward edit on the live document (see
   * buildRestore), broadcast to every connected client. Without it — tabs
   * from before that change — the client applies the version itself. The old
   * overwrite of the stored state with the old version is gone: it left
   * Postgres holding only the old version until Hocuspocus stored again (#4624).
   */
  restore: async ({ req, params, body }) => {
    try {
      const access = await authorize(req.user?.id, params.id, 'write');
      if (denied(access)) return access;

      const versionState = await readSnapshotState(params.id, params.version);
      if (!versionState) return { status: 404, body: { error: 'Snapshot not found' } };

      const applyLive = body?.apply === 'live';
      const current = applyLive
        ? await readLiveState(params.id)
        : await readCurrentState(params.id);
      await insertSnapshot(params.id, current, 'Vor der Wiederherstellung', access.userId);

      if (!applyLive) {
        return {
          status: 200,
          body: {
            success: true,
            message: 'Dokument wurde wiederhergestellt. Bitte Seite neu laden.',
          },
        };
      }

      const restored = buildRestore(current, versionState);
      try {
        await applyToLive(params.id, restored.update);
        const saved = await insertSnapshot(
          params.id,
          Y.encodeStateAsUpdate(restored.doc),
          `Wiederhergestellt von v${params.version}`,
          access.userId
        );
        return { status: 200, body: { success: true, new_version: saved.version } };
      } finally {
        restored.doc.destroy();
      }
    } catch (error) {
      log.error('[restore] Error:', error);
      return { status: 500, body: { error: 'Failed to restore snapshot' } };
    }
  },
});

export function mountDocSnapshotsContractRouter(app: Application): void {
  createExpressEndpoints(docSnapshotsContract, docSnapshotsContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'docSnapshotsContract'),
  });
}
