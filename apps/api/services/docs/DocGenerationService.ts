import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { COLLAB_SUBTYPES } from '../../routes/docs/constants.js';
import { createLogger } from '../../utils/logger.js';

import { ensureHtml } from './contentNormalization.js';
import { seedYjsStateSafe } from './seedYjsState.js';

const log = createLogger('DocGeneration');

// Subtypes the HTML document generator may pick — excludes kinds whose
// content is not BlockNote HTML (boards/sheets/presentations seed their own
// Y.Doc layouts).
const DOC_SUBTYPES = COLLAB_SUBTYPES.filter(
  (s) => s !== 'boards' && s !== 'sheets' && s !== 'presentations'
);

export const DOCUMENT_GENERATION_PROMPT = `Du bist ein Dokument-Assistent für die Grünen. Erstelle ein vollständiges Dokument basierend auf der Beschreibung.

Antworte NUR mit einem JSON-Objekt in exakt diesem Format:
{
  "title": "Passender Dokumenttitel",
  "subtype": "blank",
  "content": "<h1>Titel</h1><p>Inhalt...</p>"
}

Regeln:
- subtype muss einer dieser Werte sein: ${DOC_SUBTYPES.join(', ')}
- Wähle den passenden subtype basierend auf der Beschreibung
- content muss valides HTML sein, geeignet für einen Texteditor
- Erlaubte HTML-Tags: h1, h2, h3, p, ul, ol, li, blockquote, strong, em, hr, br, input
- Beginne das Dokument IMMER mit einer Überschrift als <h1> (z. B. die Schlagzeile einer Pressemitteilung). Verwende NIEMALS fettgedruckten Text (<strong>) als Ersatz für eine Überschrift
- Für Checklisten/Todo-Listen verwende IMMER: <ul><li><input type="checkbox">Aufgabe</li></ul>
- Erstelle realistische, vollständige Platzhalterinhalte (Musterstadt, Maxi Mustermensch, etc.)
- Schreibe auf Deutsch mit geschlechtergerechter Sprache (Genderstern *)
- Orientiere dich inhaltlich an den Themen und Werten der Grünen
- Kein Markdown, keine Erklärung, NUR das JSON-Objekt`;

export interface GeneratedDocument {
  title: string;
  subtype: string;
  content: string;
}

export interface CreatedDocument {
  id: string;
  title: string;
  content: string;
  created_by: string;
  document_subtype: string;
  [key: string]: unknown;
}

/**
 * Parse AI-generated document structure from JSON response.
 * Tries direct parse first, falls back to regex extraction.
 */
interface ParsedDocumentResponse {
  title?: unknown;
  subtype?: unknown;
  content?: unknown;
}

export function parseDocumentResponse(aiContent: string): GeneratedDocument {
  try {
    let parsed: ParsedDocumentResponse;
    try {
      parsed = JSON.parse(aiContent.trim()) as ParsedDocumentResponse;
    } catch {
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch?.[0] || '{}') as ParsedDocumentResponse;
    }
    return {
      title: typeof parsed.title === 'string' ? parsed.title : 'Neues Dokument',
      subtype:
        typeof parsed.subtype === 'string' && DOC_SUBTYPES.includes(parsed.subtype)
          ? parsed.subtype
          : 'blank',
      content: typeof parsed.content === 'string' ? parsed.content : '',
    };
  } catch {
    log.warn('Failed to parse AI document response');
    return { title: 'Neues Dokument', subtype: 'blank', content: '' };
  }
}

/**
 * Create a document in the database with optional content.
 * Reusable from controllers and chat tools.
 */
export async function createDocumentWithContent(
  title: string,
  content: string,
  subtype: string,
  userId: string
): Promise<CreatedDocument> {
  const db = getPostgresInstance();
  const htmlContent = ensureHtml(content);
  const result = await db.query(
    `INSERT INTO collaborative_documents
      (title, content, created_by, last_edited_by, document_subtype, permissions, is_public)
     VALUES ($1, $2, $3, $3, $4, $5, false)
     RETURNING *`,
    [
      title,
      htmlContent,
      userId,
      subtype,
      JSON.stringify({ [userId]: { level: 'owner', granted_at: new Date().toISOString() } }),
    ]
  );
  const doc = (result as CreatedDocument[])[0];
  await seedYjsStateSafe(doc.id, htmlContent, 'DocGeneration');
  return doc;
}
