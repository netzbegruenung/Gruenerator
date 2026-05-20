/**
 * Snapshots and instantiates collaborative documents (boards/docs) as
 * user_templates. Yjs state is stored gzipped+base64 in
 * `user_templates.content_data.yjs` — the exact wire shape of
 * `yjs_document_snapshots.snapshot_data`, so instantiation is a direct paste.
 */

import { gzipSync, gunzipSync } from 'node:zlib';

import * as Y from 'yjs';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('collaborativeTemplateService');

export interface CollaborativeSnapshot {
  yjs: string;
  subtype: string;
  title: string;
}

export interface InstantiateResult {
  documentId: string;
  subtype: string;
}

interface CollaborativeDocRow {
  id: string;
  title: string;
  document_subtype: string | null;
}

interface SnapshotRow {
  snapshot_data: Buffer;
  created_at: string;
}

interface UpdateRow {
  update_data: Buffer;
}

interface UserTemplateRow {
  id: string;
  user_id: string | null;
  template_type: string;
  title: string;
  is_private: boolean;
  status: string;
  content_data: { yjs?: string; subtype?: string } | null;
}

const TEMPLATE_TYPE_TO_SUBTYPE: Record<string, string> = {
  board: 'boards',
  doc: 'docs',
};

const SUBTYPE_TO_TEMPLATE_TYPE: Record<string, string> = {
  boards: 'board',
  docs: 'doc',
};

export function subtypeToTemplateType(subtype: string | null | undefined): string {
  if (!subtype) return 'doc';
  return SUBTYPE_TO_TEMPLATE_TYPE[subtype] ?? 'doc';
}

/**
 * Hydrate the current Y.Doc state from latest snapshot + subsequent updates,
 * then return it as a single gzipped+base64 string suitable for storage in
 * user_templates.content_data.yjs.
 */
export async function snapshotCollaborativeDoc(documentId: string): Promise<CollaborativeSnapshot> {
  const db = getPostgresInstance();

  const docRows = (await db.query(
    `SELECT id, title, document_subtype
     FROM collaborative_documents
     WHERE id = $1 AND is_deleted = false`,
    [documentId]
  )) as CollaborativeDocRow[];

  if (docRows.length === 0) {
    throw new Error('Document not found');
  }
  const doc = docRows[0];

  const snapshotRows = (await db.query(
    `SELECT snapshot_data, created_at
     FROM yjs_document_snapshots WHERE document_id = $1
     ORDER BY version DESC LIMIT 1`,
    [documentId]
  )) as SnapshotRow[];

  const ydoc = new Y.Doc();

  if (snapshotRows.length > 0) {
    Y.applyUpdate(ydoc, gunzipSync(snapshotRows[0].snapshot_data));

    const updates = (await db.query(
      `SELECT update_data FROM yjs_document_updates
       WHERE document_id = $1 AND created_at > $2
       ORDER BY created_at ASC`,
      [documentId, snapshotRows[0].created_at]
    )) as UpdateRow[];

    for (const u of updates) {
      try {
        Y.applyUpdate(ydoc, gunzipSync(u.update_data));
      } catch (err) {
        log.warn(`[snapshot] failed to apply update for ${documentId}: ${(err as Error).message}`);
      }
    }
  } else {
    const updates = (await db.query(
      `SELECT update_data FROM yjs_document_updates
       WHERE document_id = $1 ORDER BY created_at ASC`,
      [documentId]
    )) as UpdateRow[];

    for (const u of updates) {
      try {
        Y.applyUpdate(ydoc, gunzipSync(u.update_data));
      } catch (err) {
        log.warn(`[snapshot] failed to apply update for ${documentId}: ${(err as Error).message}`);
      }
    }
  }

  const state = Y.encodeStateAsUpdate(ydoc);
  const compressed = gzipSync(Buffer.from(state));

  return {
    yjs: compressed.toString('base64'),
    subtype: doc.document_subtype ?? 'docs',
    title: doc.title,
  };
}

/**
 * Create a fresh collaborative_document and seed its Yjs state from a saved
 * template. Inserts a single snapshot at version 1 — Hocuspocus will pick it
 * up on the next client connection.
 */
export async function createDocFromTemplate(
  userId: string,
  templateId: string,
  title: string
): Promise<InstantiateResult> {
  const db = getPostgresInstance();

  const templateRows = (await db.query(
    `SELECT id, user_id, template_type, title, is_private, status, content_data
     FROM user_templates
     WHERE id = $1 AND type = 'template'`,
    [templateId]
  )) as UserTemplateRow[];

  if (templateRows.length === 0) {
    throw new Error('Template not found');
  }
  const template = templateRows[0];

  const ownsTemplate = template.user_id === userId;
  const isPublicPublished = !template.is_private && template.status === 'published';
  if (!ownsTemplate && !isPublicPublished) {
    throw new Error('Not authorized to use this template');
  }

  const yjsBase64 = template.content_data?.yjs;
  if (!yjsBase64 || typeof yjsBase64 !== 'string') {
    throw new Error('Template has no Yjs content');
  }

  const subtype =
    template.content_data?.subtype ?? TEMPLATE_TYPE_TO_SUBTYPE[template.template_type] ?? 'docs';

  const ownerPermissions = JSON.stringify({
    [userId]: { level: 'owner', granted_at: new Date().toISOString() },
  });

  const newDocRows = (await db.query(
    `INSERT INTO collaborative_documents
      (title, created_by, last_edited_by, document_subtype, permissions, is_public)
     VALUES ($1, $2, $2, $3, $4::jsonb, false)
     RETURNING id`,
    [title.trim() || template.title, userId, subtype, ownerPermissions]
  )) as { id: string }[];

  const newDocId = newDocRows[0].id;

  const snapshotBuffer = Buffer.from(yjsBase64, 'base64');

  await db.query(
    `INSERT INTO yjs_document_snapshots
      (document_id, snapshot_data, version, created_at, is_auto_save, label, created_by)
     VALUES ($1, $2, 1, CURRENT_TIMESTAMP, false, $3, $4)`,
    [newDocId, snapshotBuffer, `from-template:${templateId}`, userId]
  );

  log.info(`[instantiate] created ${subtype} doc ${newDocId} from template ${templateId}`);

  return { documentId: newDocId, subtype };
}
