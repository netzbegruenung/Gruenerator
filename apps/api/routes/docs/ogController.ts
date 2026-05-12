import { gunzipSync } from 'zlib';

import { blockNoteXmlToHtml } from '@gruenerator/hocuspocus';
import { Router, type Request, type Response } from 'express';
import * as Y from 'yjs';

import { env } from '../../config/env.js';
import { type CollaborativeDocument } from '../../database/schema/collaborative.js';
import { type YjsDocumentSnapshotRow } from '../../database/schema/yjs.js';
import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { createLogger } from '../../utils/logger.js';

import { DOCS_SUBTYPES } from './constants.js';

const log = createLogger('ogController');

const router = Router();
const db = getPostgresInstance();

const ogCache = new Map<string, { html: string; expires: number }>();
const OG_CACHE_TTL = 5 * 60 * 1000;

const WEB_BASE_URL = env.WEB_BASE_URL || 'https://www.gruenerator.de';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildOgHtml(title: string, description: string, url: string, imageUrl: string): string {
  const safeTitle = escapeHtml(title);
  const safeDesc = escapeHtml(description);

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>${safeTitle}</title>
  <meta name="description" content="${safeDesc}" />
  <meta property="og:title" content="${safeTitle}" />
  <meta property="og:description" content="${safeDesc}" />
  <meta property="og:image" content="${escapeHtml(imageUrl)}" />
  <meta property="og:url" content="${escapeHtml(url)}" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="Grünerator" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${safeTitle}" />
  <meta name="twitter:description" content="${safeDesc}" />
  <meta name="twitter:image" content="${escapeHtml(imageUrl)}" />
</head>
<body></body>
</html>`;
}

/**
 * @route   GET /api/og/docs/:id
 * @desc    Return minimal HTML with OG meta tags for social crawler link previews
 * @access  Public (only hit by crawlers routed via nginx)
 */
router.get('/:id', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params;

    const cached = ogCache.get(id);
    if (cached && cached.expires > Date.now()) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.send(cached.html);
    }

    const result = await db.query<
      Pick<CollaborativeDocument, 'id' | 'title' | 'share_mode' | 'document_subtype'>
    >(
      `SELECT d.id, d.title, d.share_mode, d.document_subtype
       FROM collaborative_documents d
       WHERE d.id = $1 AND d.is_deleted = false AND d.document_subtype = ANY($2::text[])
         AND (d.share_mode != 'private' OR d.is_public = true)`,
      [id, DOCS_SUBTYPES]
    );

    if (result.length === 0) {
      const fallbackHtml = buildOgHtml(
        'Grünerator',
        'KI-Assistent für grüne Politik',
        `${WEB_BASE_URL}/docs/${encodeURIComponent(id)}`,
        `${WEB_BASE_URL}/og-image.png`
      );
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      return res.send(fallbackHtml);
    }

    const doc = result[0];
    let previewText = 'Kollaboratives Dokument auf Grünerator';

    if (doc.share_mode === 'public') {
      const snapshotResult = await db.query<Pick<YjsDocumentSnapshotRow, 'snapshot_data'>>(
        `SELECT snapshot_data
         FROM yjs_document_snapshots
         WHERE document_id = $1
         ORDER BY version DESC
         LIMIT 1`,
        [id]
      );

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
          if (text.length > 0) {
            previewText = text.length > 200 ? text.slice(0, 197) + '...' : text;
          }
        } catch {
          // Y.js extraction failed — use default description
        }
      }
    }

    const url = `${WEB_BASE_URL}/docs/${encodeURIComponent(id)}`;
    const imageUrl = `${WEB_BASE_URL}/og-image.png`;
    const html = buildOgHtml(doc.title || 'Grünerator Docs', previewText, url, imageUrl);

    ogCache.set(id, { html, expires: Date.now() + OG_CACHE_TTL });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.send(html);
  } catch (error) {
    log.error('[OG] Error generating OG page for docs:', { error });
    const fallbackHtml = buildOgHtml(
      'Grünerator',
      'KI-Assistent für grüne Politik',
      WEB_BASE_URL,
      `${WEB_BASE_URL}/og-image.png`
    );
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(fallbackHtml);
  }
});

export default router;
