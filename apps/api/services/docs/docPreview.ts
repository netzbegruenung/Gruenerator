/**
 * Server-side document preview for notification emails. Collaborative docs keep an
 * HTML snapshot in `collaborative_documents.content`; we strip it to a short, legible
 * excerpt (mirrors the frontend parseDocPreview, minus the DOM). Falls back to
 * title-only when the content column is empty/stale — the email must never fail on a
 * missing preview.
 */
import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';

const db = getPostgresInstance();

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
  '&bdquo;': '„',
  '&ldquo;': '“',
};

function htmlToSnippet(html: string, max = 200): string | null {
  const text = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, (e) => ENTITIES[e] ?? ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

export interface DocPreview {
  title: string;
  snippet: string | null;
}

export async function getDocPreview(documentId: string): Promise<DocPreview | null> {
  try {
    const rows = await db.query<{ title: string | null; content: string | null }>(
      'SELECT title, content FROM collaborative_documents WHERE id = $1',
      [documentId]
    );
    if (rows.length === 0) return null;
    return {
      title: rows[0].title || 'Unbenanntes Dokument',
      snippet: rows[0].content ? htmlToSnippet(rows[0].content) : null,
    };
  } catch {
    return null;
  }
}
