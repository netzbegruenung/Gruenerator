import { gunzipSync } from 'zlib';

import { blockNoteXmlToHtml } from '@gruenerator/hocuspocus';
import { Router, type Request, type Response } from 'express';
import * as Y from 'yjs';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';

import { DOCS_SUBTYPES } from './constants.js';

const router = Router();
const db = getPostgresInstance();

const ogCache = new Map<string, { data: Record<string, unknown>; expires: number }>();
const OG_CACHE_TTL = 5 * 60 * 1000;

/**
 * @route   GET /api/docs/public/:id
 * @desc    Check if a document is publicly accessible (no auth required)
 * @access  Public
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = (await db.query(
      `SELECT id, title, share_permission, share_mode, document_subtype
       FROM collaborative_documents
       WHERE id = $1 AND is_deleted = false AND document_subtype = ANY($2::text[])
         AND (share_mode != 'private' OR is_public = true)`,
      [id, DOCS_SUBTYPES]
    )) as unknown as {
      id: string;
      title: string;
      share_permission: string;
      share_mode: 'private' | 'authenticated' | 'public';
      document_subtype: string;
    }[];

    if (result.length === 0) {
      return res.status(404).json({ error: 'Document not found or not publicly accessible' });
    }

    const doc = result[0];

    if (doc.share_mode === 'authenticated') {
      return res.json({ share_mode: 'authenticated', title: doc.title });
    }

    return res.json(doc);
  } catch (error: any) {
    console.error('[Docs] Error checking public document:', error);
    return res.status(500).json({ error: 'Failed to check document' });
  }
});

/**
 * @route   GET /api/docs/public/:id/og
 * @desc    Return OG metadata for link previews (title + preview text)
 * @access  Public
 */
router.get('/:id/og', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const cached = ogCache.get(id as string);
    if (cached && cached.expires > Date.now()) {
      return res.json(cached.data);
    }

    const result = (await db.query(
      `SELECT d.id, d.title, d.share_mode, d.document_subtype
       FROM collaborative_documents d
       WHERE d.id = $1 AND d.is_deleted = false AND d.document_subtype = ANY($2::text[])
         AND (d.share_mode != 'private' OR d.is_public = true)`,
      [id, DOCS_SUBTYPES]
    )) as unknown as {
      id: string;
      title: string;
      share_mode: 'private' | 'authenticated' | 'public';
      document_subtype: string;
    }[];

    if (result.length === 0) {
      return res.status(404).json({ error: 'Not found' });
    }

    const doc = result[0];
    let preview_text: string | null = null;

    if (doc.share_mode === 'public') {
      const snapshotResult = (await db.query(
        `SELECT snapshot_data
         FROM yjs_document_snapshots
         WHERE document_id = $1
         ORDER BY version DESC
         LIMIT 1`,
        [id]
      )) as unknown as { snapshot_data: Buffer }[];

      if (snapshotResult.length > 0) {
        try {
          const decompressed = gunzipSync(snapshotResult[0].snapshot_data);
          const ydoc = new Y.Doc();
          Y.applyUpdate(ydoc, decompressed);
          const xmlFragment = ydoc.getXmlFragment('document-store');
          const htmlContent = blockNoteXmlToHtml(xmlFragment.toString());

          let text = htmlContent;
          let prev = '';
          while (prev !== text) {
            prev = text;
            text = text.replace(/<[^>]+>/g, '');
          }
          text = text.replace(/\s+/g, ' ').trim();
          preview_text = text.length > 200 ? text.slice(0, 197) + '...' : text;
        } catch {
          // Y.js extraction failed — return title only
        }
      }
    }

    const data = {
      title: doc.title,
      preview_text,
      document_subtype: doc.document_subtype,
      share_mode: doc.share_mode,
    };

    ogCache.set(id as string, { data, expires: Date.now() + OG_CACHE_TTL });
    return res.json(data);
  } catch (error: any) {
    console.error('[Docs] Error fetching OG metadata:', error);
    return res.status(500).json({ error: 'Failed to fetch metadata' });
  }
});

export default router;
