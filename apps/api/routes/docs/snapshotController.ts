import { gunzipSync, gzipSync } from 'zlib';

import { blockNoteXmlToHtml } from '@gruenerator/hocuspocus';
import { Router, type Request, type Response } from 'express';
import * as Y from 'yjs';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';

import { DOCS_SUBTYPES } from './constants.js';

interface DocumentRow {
  id: string;
  created_by: string;
  permissions: Record<string, { level: string }> | null;
  is_public: boolean;
  share_mode: string;
}

interface SnapshotRow {
  id: string;
  version: number;
  created_at: string;
  is_auto_save: boolean;
  label: string | null;
  created_by: string | null;
  created_by_name: string | null;
  snapshot_data?: Buffer;
}

const router = Router();
const db = getPostgresInstance();

async function getAccessibleDocument(
  id: string,
  userId: string,
  res: Response
): Promise<DocumentRow | null> {
  const result = (await db.query(
    `SELECT id, created_by, permissions, is_public, share_mode
     FROM collaborative_documents
     WHERE id = $1 AND is_deleted = false AND document_subtype = ANY($2::text[])`,
    [id, DOCS_SUBTYPES]
  )) as DocumentRow[];

  if (result.length === 0) {
    res.status(404).json({ error: 'Document not found' });
    return null;
  }

  const doc = result[0];
  const isOwner = doc.created_by === userId;
  const hasDirectPerm = !!(doc.permissions && doc.permissions[userId]);
  const hasAccess = isOwner || doc.is_public || doc.share_mode === 'authenticated' || hasDirectPerm;

  if (!hasAccess) {
    const groupAccess = (await db.query(
      `SELECT gcs.permissions FROM group_content_shares gcs
       INNER JOIN group_memberships gm ON gm.group_id = gcs.group_id AND gm.user_id = $1 AND gm.is_active = TRUE
       WHERE gcs.content_type = 'collaborative_documents' AND gcs.content_id = $2 LIMIT 1`,
      [userId, id]
    )) as { permissions: { read: boolean } | null }[];

    if (groupAccess.length === 0 || groupAccess[0].permissions?.read === false) {
      res.status(403).json({ error: 'Access denied' });
      return null;
    }
  }

  return doc;
}

function canEditDoc(doc: DocumentRow, userId: string): boolean {
  if (doc.created_by === userId) return true;
  const perm = doc.permissions?.[userId];
  if (perm) return ['owner', 'editor'].includes(perm.level);
  return false;
}

router.get('/:id/snapshots', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'User not authenticated' });

    const doc = await getAccessibleDocument(req.params.id, userId, res);
    if (!doc) return;

    const snapshots = (await db.query(
      `SELECT s.id, s.version, s.created_at, s.is_auto_save, s.label, s.created_by,
              p.display_name as created_by_name
       FROM yjs_document_snapshots s
       LEFT JOIN profiles p ON s.created_by = p.id
       WHERE s.document_id = $1
       ORDER BY s.version DESC`,
      [req.params.id]
    )) as SnapshotRow[];

    const grouped = req.query.grouped !== 'false';

    if (grouped && snapshots.length > 1) {
      const GROUP_WINDOW_MS = 30 * 60 * 1000;
      const result: Array<{
        id: string;
        version: number;
        created_at: string;
        is_auto_save: boolean;
        label: string | null;
        created_by_name: string | null;
        snapshot_count: number;
        earliest_in_group: string;
      }> = [];

      // Snapshots are DESC — walk and group consecutive auto-saves within 30min
      for (const s of snapshots) {
        const prev = result[result.length - 1];
        const canGroup =
          prev &&
          prev.is_auto_save &&
          s.is_auto_save &&
          !s.label &&
          !prev.label &&
          new Date(prev.earliest_in_group).getTime() - new Date(s.created_at).getTime() <
            GROUP_WINDOW_MS;

        if (canGroup) {
          prev.snapshot_count++;
          prev.earliest_in_group = s.created_at;
        } else {
          result.push({
            id: s.id,
            version: s.version,
            created_at: s.created_at,
            is_auto_save: s.is_auto_save,
            label: s.label,
            created_by_name: s.created_by_name,
            snapshot_count: 1,
            earliest_in_group: s.created_at,
          });
        }
      }

      return res.json({ snapshots: result });
    }

    return res.json({
      snapshots: snapshots.map((s) => ({
        id: s.id,
        version: s.version,
        created_at: s.created_at,
        is_auto_save: s.is_auto_save,
        label: s.label,
        created_by_name: s.created_by_name,
        snapshot_count: 1,
      })),
    });
  } catch (error: unknown) {
    console.error('[Docs] Error listing snapshots:', error);
    return res.status(500).json({ error: 'Failed to list snapshots' });
  }
});

router.post('/:id/snapshots', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'User not authenticated' });

    const doc = await getAccessibleDocument(req.params.id, userId, res);
    if (!doc) return;

    if (!canEditDoc(doc, userId)) {
      return res.status(403).json({ error: 'Edit permission required' });
    }

    const { label } = req.body as { label?: string };

    // Load current document state from latest snapshot + updates
    const snapshotResult = (await db.query(
      `SELECT snapshot_data, version, created_at
       FROM yjs_document_snapshots WHERE document_id = $1
       ORDER BY version DESC LIMIT 1`,
      [req.params.id]
    )) as { snapshot_data: Buffer; version: number; created_at: string }[];

    const ydoc = new Y.Doc();

    if (snapshotResult.length > 0) {
      const decompressed = gunzipSync(snapshotResult[0].snapshot_data);
      Y.applyUpdate(ydoc, decompressed);

      const updates = (await db.query(
        `SELECT update_data FROM yjs_document_updates
         WHERE document_id = $1 AND created_at > $2
         ORDER BY created_at ASC`,
        [req.params.id, snapshotResult[0].created_at]
      )) as { update_data: Buffer }[];

      for (const u of updates) {
        Y.applyUpdate(ydoc, gunzipSync(u.update_data));
      }
    }

    const state = Y.encodeStateAsUpdate(ydoc);
    const compressed = gzipSync(Buffer.from(state));

    const versionResult = (await db.query(
      `SELECT COALESCE(MAX(version), 0) + 1 as next_version
       FROM yjs_document_snapshots WHERE document_id = $1`,
      [req.params.id]
    )) as { next_version: number }[];

    const nextVersion = versionResult[0].next_version;

    await db.query(
      `INSERT INTO yjs_document_snapshots
        (document_id, snapshot_data, version, created_at, is_auto_save, label, created_by)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP, false, $4, $5)`,
      [req.params.id, compressed, nextVersion, label || null, userId]
    );

    return res.status(201).json({
      version: nextVersion,
      created_at: new Date().toISOString(),
    });
  } catch (error: unknown) {
    console.error('[Docs] Error creating snapshot:', error);
    return res.status(500).json({ error: 'Failed to create snapshot' });
  }
});

router.get(
  '/:id/snapshots/:version/preview',
  async (req: Request<{ id: string; version: string }>, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'User not authenticated' });

      const doc = await getAccessibleDocument(req.params.id, userId, res);
      if (!doc) return;

      const version = parseInt(req.params.version, 10);
      if (!Number.isFinite(version)) {
        return res.status(400).json({ error: 'Invalid version number' });
      }

      const result = (await db.query(
        `SELECT snapshot_data, created_at
         FROM yjs_document_snapshots
         WHERE document_id = $1 AND version = $2`,
        [req.params.id, version]
      )) as { snapshot_data: Buffer; created_at: string }[];

      if (result.length === 0) {
        return res.status(404).json({ error: 'Snapshot not found' });
      }

      const decompressed = gunzipSync(result[0].snapshot_data);
      const ydoc = new Y.Doc();
      Y.applyUpdate(ydoc, decompressed);

      const fragment = ydoc.getXmlFragment('document-store');
      const xml = fragment.toString();
      const html = blockNoteXmlToHtml(xml);

      return res.json({
        version,
        html,
        created_at: result[0].created_at,
      });
    } catch (error: unknown) {
      console.error('[Docs] Error getting snapshot preview:', error);
      return res.status(500).json({ error: 'Failed to get snapshot preview' });
    }
  }
);

router.post(
  '/:id/snapshots/:version/restore',
  async (req: Request<{ id: string; version: string }>, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'User not authenticated' });

      const doc = await getAccessibleDocument(req.params.id, userId, res);
      if (!doc) return;

      if (!canEditDoc(doc, userId)) {
        return res.status(403).json({ error: 'Edit permission required to restore' });
      }

      const version = parseInt(req.params.version, 10);
      if (!Number.isFinite(version)) {
        return res.status(400).json({ error: 'Invalid version number' });
      }

      const result = (await db.query(
        `SELECT snapshot_data
         FROM yjs_document_snapshots
         WHERE document_id = $1 AND version = $2`,
        [req.params.id, version]
      )) as { snapshot_data: Buffer }[];

      if (result.length === 0) {
        return res.status(404).json({ error: 'Snapshot not found' });
      }

      const decompressed = gunzipSync(result[0].snapshot_data);
      const ydoc = new Y.Doc();
      Y.applyUpdate(ydoc, decompressed);

      const state = Y.encodeStateAsUpdate(ydoc);
      const compressedState = gzipSync(Buffer.from(state));

      await db.query(
        `INSERT INTO yjs_document_updates (document_id, update_data, created_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP)`,
        [req.params.id, compressedState]
      );

      const versionResult = (await db.query(
        `SELECT COALESCE(MAX(version), 0) + 1 as next_version
         FROM yjs_document_snapshots WHERE document_id = $1`,
        [req.params.id]
      )) as { next_version: number }[];

      const nextVersion = versionResult[0].next_version;

      await db.query(
        `INSERT INTO yjs_document_snapshots
          (document_id, snapshot_data, version, created_at, is_auto_save, label, created_by)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP, false, $4, $5)`,
        [req.params.id, compressedState, nextVersion, `Wiederhergestellt von v${version}`, userId]
      );

      const fragment = ydoc.getXmlFragment('document-store');
      const xml = fragment.toString();
      const html = blockNoteXmlToHtml(xml).slice(0, 2000);

      await db.query(
        `UPDATE collaborative_documents
         SET content = $2, updated_at = CURRENT_TIMESTAMP, last_edited_by = $3
         WHERE id = $1`,
        [req.params.id, html, userId]
      );

      return res.json({
        success: true,
        new_version: nextVersion,
        message: 'Dokument wurde wiederhergestellt. Bitte Seite neu laden.',
      });
    } catch (error: unknown) {
      console.error('[Docs] Error restoring snapshot:', error);
      return res.status(500).json({ error: 'Failed to restore snapshot' });
    }
  }
);

export default router;
