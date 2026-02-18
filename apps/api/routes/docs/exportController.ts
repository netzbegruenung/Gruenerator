import { gunzipSync } from 'zlib';

import { Router, type Request, type Response } from 'express';
import * as Y from 'yjs';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';

import { DOCS_SUBTYPES } from './constants.js';

/**
 * Permission entry for a user on a document
 */
interface PermissionEntry {
  level: 'owner' | 'editor' | 'viewer';
  granted_at: string;
  granted_by?: string;
}

/**
 * Permissions object mapping user IDs to their permission entries
 */
interface DocumentPermissions {
  [userId: string]: PermissionEntry;
}

/**
 * Document row with permissions for export
 */
interface DocumentWithPermissions {
  id: string;
  title: string;
  permissions: DocumentPermissions | null;
  [key: string]: unknown;
}

/**
 * Y.js document snapshot row
 */
interface YjsSnapshotRow {
  snapshot_data: Buffer;
  [key: string]: unknown;
}

const router = Router();
const db = getPostgresInstance();

/**
 * Convert HTML to Markdown
 */
function htmlToMarkdown(html: string): string {
  let markdown = html;

  // Headers
  markdown = markdown.replace(/<h1>(.*?)<\/h1>/gi, '# $1\n\n');
  markdown = markdown.replace(/<h2>(.*?)<\/h2>/gi, '## $1\n\n');
  markdown = markdown.replace(/<h3>(.*?)<\/h3>/gi, '### $1\n\n');
  markdown = markdown.replace(/<h4>(.*?)<\/h4>/gi, '#### $1\n\n');
  markdown = markdown.replace(/<h5>(.*?)<\/h5>/gi, '##### $1\n\n');
  markdown = markdown.replace(/<h6>(.*?)<\/h6>/gi, '###### $1\n\n');

  // Bold
  markdown = markdown.replace(/<strong>(.*?)<\/strong>/gi, '**$1**');
  markdown = markdown.replace(/<b>(.*?)<\/b>/gi, '**$1**');

  // Italic
  markdown = markdown.replace(/<em>(.*?)<\/em>/gi, '*$1*');
  markdown = markdown.replace(/<i>(.*?)<\/i>/gi, '*$1*');

  // Underline (not standard Markdown, use HTML)
  markdown = markdown.replace(/<u>(.*?)<\/u>/gi, '<u>$1</u>');

  // Links
  markdown = markdown.replace(/<a\s+href="(.*?)".*?>(.*?)<\/a>/gi, '[$2]($1)');

  // Lists
  markdown = markdown.replace(/<ul>(.*?)<\/ul>/gis, (match, content) => {
    const items = content.match(/<li>(.*?)<\/li>/gi) || [];
    return (
      items
        .map((item: string) => {
          const text = item.replace(/<li>(.*?)<\/li>/i, '$1');
          return `- ${text}`;
        })
        .join('\n') + '\n\n'
    );
  });

  markdown = markdown.replace(/<ol>(.*?)<\/ol>/gis, (match, content) => {
    const items = content.match(/<li>(.*?)<\/li>/gi) || [];
    return (
      items
        .map((item: string, index: number) => {
          const text = item.replace(/<li>(.*?)<\/li>/i, '$1');
          return `${index + 1}. ${text}`;
        })
        .join('\n') + '\n\n'
    );
  });

  // Paragraphs
  markdown = markdown.replace(/<p>(.*?)<\/p>/gi, '$1\n\n');

  // Line breaks
  markdown = markdown.replace(/<br\s*\/?>/gi, '\n');

  // Code blocks
  markdown = markdown.replace(/<pre><code>(.*?)<\/code><\/pre>/gis, '```\n$1\n```\n\n');
  markdown = markdown.replace(/<code>(.*?)<\/code>/gi, '`$1`');

  // Blockquotes
  markdown = markdown.replace(/<blockquote>(.*?)<\/blockquote>/gis, (match, content) => {
    const lines = content.split('\n');
    return lines.map((line: string) => `> ${line.trim()}`).join('\n') + '\n\n';
  });

  // Remove remaining HTML tags
  markdown = markdown.replace(/<[^>]+>/g, '');

  // Clean up excessive newlines
  markdown = markdown.replace(/\n{3,}/g, '\n\n');

  return markdown.trim();
}

/**
 * @route   GET /api/docs/:id/export/html
 * @desc    Export document as HTML
 * @access  Private
 */
router.get('/:id/export/html', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Check if user has access to this document
    const documentResult = (await db.query(
      `SELECT id, title, permissions
       FROM collaborative_documents
       WHERE id = $1 AND is_deleted = false AND document_subtype = ANY($2::text[])`,
      [id, DOCS_SUBTYPES]
    )) as DocumentWithPermissions[];

    if (documentResult.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const document = documentResult[0];
    const permissions = document.permissions || {};

    if (!permissions[userId]) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get latest Y.js snapshot
    const snapshotResult = (await db.query(
      `SELECT snapshot_data
       FROM yjs_document_snapshots
       WHERE document_id = $1
       ORDER BY version DESC
       LIMIT 1`,
      [id]
    )) as YjsSnapshotRow[];

    let content = '<p>Empty document</p>';

    if (snapshotResult.length > 0) {
      const decompressed = gunzipSync(snapshotResult[0].snapshot_data);
      const ydoc = new Y.Doc();
      Y.applyUpdate(ydoc, decompressed);

      // Get the prosemirror XML fragment
      const xmlFragment = ydoc.getXmlFragment('document-store');

      // For now, return a simple HTML structure
      // In production, you'd convert the Y.js XML to proper HTML
      content = xmlFragment.toString();
    }

    const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${document.title}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      line-height: 1.6;
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem;
      color: #333;
    }
    h1, h2, h3, h4, h5, h6 {
      margin-top: 1.5rem;
      margin-bottom: 0.5rem;
    }
    a {
      color: #467832;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
    code {
      background: #f4f4f4;
      padding: 0.2rem 0.4rem;
      border-radius: 3px;
      font-family: 'Courier New', monospace;
    }
    pre {
      background: #f4f4f4;
      padding: 1rem;
      border-radius: 4px;
      overflow-x: auto;
    }
    blockquote {
      border-left: 4px solid #467832;
      margin: 1rem 0;
      padding-left: 1rem;
      color: #666;
    }
  </style>
</head>
<body>
  <h1>${document.title}</h1>
  ${content}
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${document.title}.html"`);
    return res.send(html);
  } catch (error: any) {
    console.error('[Export] Error exporting HTML:', error);
    return res.status(500).json({ error: 'Failed to export document', details: error.message });
  }
});

/**
 * @route   GET /api/docs/:id/export/markdown
 * @desc    Export document as Markdown
 * @access  Private
 */
router.get('/:id/export/markdown', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Check if user has access to this document
    const documentResult = (await db.query(
      `SELECT id, title, permissions
       FROM collaborative_documents
       WHERE id = $1 AND is_deleted = false AND document_subtype = ANY($2::text[])`,
      [id, DOCS_SUBTYPES]
    )) as DocumentWithPermissions[];

    if (documentResult.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const document = documentResult[0];
    const permissions = document.permissions || {};

    if (!permissions[userId]) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get latest Y.js snapshot
    const snapshotResult = (await db.query(
      `SELECT snapshot_data
       FROM yjs_document_snapshots
       WHERE document_id = $1
       ORDER BY version DESC
       LIMIT 1`,
      [id]
    )) as YjsSnapshotRow[];

    let content = 'Empty document';

    if (snapshotResult.length > 0) {
      const decompressed = gunzipSync(snapshotResult[0].snapshot_data);
      const ydoc = new Y.Doc();
      Y.applyUpdate(ydoc, decompressed);

      // Get the prosemirror XML fragment
      const xmlFragment = ydoc.getXmlFragment('document-store');
      const htmlContent = xmlFragment.toString();

      // Convert to Markdown
      content = htmlToMarkdown(htmlContent);
    }

    const markdown = `# ${document.title}\n\n${content}`;

    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${document.title}.md"`);
    return res.send(markdown);
  } catch (error: any) {
    console.error('[Export] Error exporting Markdown:', error);
    return res.status(500).json({ error: 'Failed to export document', details: error.message });
  }
});

/**
 * @route   GET /api/docs/:id/export/text
 * @desc    Export document as plain text
 * @access  Private
 */
router.get('/:id/export/text', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Check if user has access to this document
    const documentResult = (await db.query(
      `SELECT id, title, permissions
       FROM collaborative_documents
       WHERE id = $1 AND is_deleted = false AND document_subtype = ANY($2::text[])`,
      [id, DOCS_SUBTYPES]
    )) as DocumentWithPermissions[];

    if (documentResult.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const document = documentResult[0];
    const permissions = document.permissions || {};

    if (!permissions[userId]) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get latest Y.js snapshot
    const snapshotResult = (await db.query(
      `SELECT snapshot_data
       FROM yjs_document_snapshots
       WHERE document_id = $1
       ORDER BY version DESC
       LIMIT 1`,
      [id]
    )) as YjsSnapshotRow[];

    let content = 'Empty document';

    if (snapshotResult.length > 0) {
      const decompressed = gunzipSync(snapshotResult[0].snapshot_data);
      const ydoc = new Y.Doc();
      Y.applyUpdate(ydoc, decompressed);

      // Get the prosemirror XML fragment
      const xmlFragment = ydoc.getXmlFragment('document-store');
      const htmlContent = xmlFragment.toString();

      // Strip all HTML tags (loop to handle nested/malformed tags)
      content = htmlContent;
      let prev = '';
      while (prev !== content) {
        prev = content;
        content = content.replace(/<[^>]+>/g, '');
      }
      content = content.replace(/\s+/g, ' ').trim();
    }

    const text = `${document.title}\n\n${content}`;

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${document.title}.txt"`);
    return res.send(text);
  } catch (error: any) {
    console.error('[Export] Error exporting text:', error);
    return res.status(500).json({ error: 'Failed to export document', details: error.message });
  }
});

export default router;
