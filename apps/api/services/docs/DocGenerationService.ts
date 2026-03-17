import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { COLLAB_SUBTYPES } from '../../routes/docs/constants.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('DocGeneration');

const DOC_SUBTYPES = COLLAB_SUBTYPES.filter((s) => s !== 'boards');

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
- Erlaubte HTML-Tags: h1, h2, h3, p, ul, ol, li, blockquote, strong, em, hr, br
- Für Checklisten verwende: <ul><li><input type="checkbox">Aufgabe</li></ul>
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
export function parseDocumentResponse(aiContent: string): GeneratedDocument {
  try {
    let parsed;
    try {
      parsed = JSON.parse(aiContent.trim());
    } catch {
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch?.[0] || '{}');
    }
    return {
      title: parsed.title || 'Neues Dokument',
      subtype: DOC_SUBTYPES.includes(parsed.subtype) ? parsed.subtype : 'blank',
      content: parsed.content || '',
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
  const result = await db.query(
    `INSERT INTO collaborative_documents
      (title, content, created_by, last_edited_by, document_subtype, permissions, is_public)
     VALUES ($1, $2, $3, $3, $4, $5, false)
     RETURNING *`,
    [
      title,
      content,
      userId,
      subtype,
      JSON.stringify({ [userId]: { level: 'owner', granted_at: new Date().toISOString() } }),
    ]
  );
  return (result as CreatedDocument[])[0];
}
