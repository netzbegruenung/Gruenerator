/**
 * Die Docs, Präsentationen, Tabellen und Boards eines Projekts als Material
 * für dessen Chats.
 *
 * Anders als Dateien (`projectFiles.ts`) sind kollaborative Dokumente nicht in
 * Qdrant indexiert: ein Chat liest sie nur als Volltext aus Yjs, wenn jemand sie
 * per @doc nennt (`readMentionedDocs`). Für Projekte geht derselbe Lesepfad
 * mit einem Budget: die neuesten geteilten Dokumente, je Dokument gekürzt. Das
 * Material kommt als „REFERENZIERTE"-Abschnitt dazu und steuert keine Route —
 * wie ein mitgetragenes @doc.
 *
 * Zugriffsregel in der Abfrage: aktive Mitgliedschaft im Projekt des Threads,
 * eigener Thread oder Team-Chat (`projectThreadScopeSql`). Lesen braucht nicht
 * mehr als Mitgliedschaft; getrashte Dokumente fallen heraus (`deleted_at`
 * UND `is_deleted`, siehe CLAUDE.md „Papierkorb").
 */
import { getPostgresInstance } from '../../database/services/PostgresService.js';

import { projectThreadScopeSql } from './projectThreadScope.js';

/**
 * Wie viele Dokumente ein Turn höchstens mitliest. Jedes bringt bis zu
 * `PROJECT_COLLAB_DOC_CHAR_CAP` Zeichen in den Prompt, und das Material wird bei
 * JEDEM Turn des Projekt-Chats neu gelesen: 8 × 4000 Zeichen ≈ 8k Token sind
 * der Preis, den ein Projekt-Chat dafür zahlt. Mehr Dokumente findet die Person
 * über @doc oder die Titelliste des Projekt-Werkzeugs.
 */
export const PROJECT_COLLAB_DOC_CAP = 8;

/** Obergrenze je Dokument (unter dem 8000er-Deckel einer @doc-Nennung). */
export const PROJECT_COLLAB_DOC_CHAR_CAP = 4000;

/** Welche Arten gelesen werden — `video` hat keinen Text. */
const READABLE_SUBTYPES = [
  'blank',
  'docs',
  'antrag',
  'pressemitteilung',
  'protokoll',
  'notizen',
  'redaktionsplan',
  'checkliste',
  'einladung',
  'tabelle',
  'canvas',
  'presentations',
  'sheets',
  'boards',
] as const;

export interface ProjectCollabDocs {
  /** Docs, Präsentationen, Canvas: gelesen über `readMentionedDocs`. */
  docIds: string[];
  sheetIds: string[];
  boardIds: string[];
}

export async function getProjectCollabDocs(
  threadId: string,
  userId: string
): Promise<ProjectCollabDocs> {
  const rows = (await getPostgresInstance().query(
    `SELECT cd.id, COALESCE(cd.document_subtype, 'docs') AS subtype
       FROM ${projectThreadScopeSql('$1', '$2')}
       JOIN group_content_shares gcs ON gcs.group_id = g.id AND gcs.content_type = 'collaborative_documents'
       -- content_id ist text, collaborative_documents.id uuid.
       JOIN collaborative_documents cd ON cd.id::text = gcs.content_id
      WHERE cd.deleted_at IS NULL AND cd.is_deleted = false
        AND COALESCE(cd.document_subtype, 'docs') = ANY($4::text[])
      ORDER BY gcs.shared_at DESC
      LIMIT $3`,
    [threadId, userId, PROJECT_COLLAB_DOC_CAP, [...READABLE_SUBTYPES]]
  )) as { id: string; subtype: string }[];

  const out: ProjectCollabDocs = { docIds: [], sheetIds: [], boardIds: [] };
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    if (r.subtype === 'sheets') out.sheetIds.push(r.id);
    else if (r.subtype === 'boards') out.boardIds.push(r.id);
    else out.docIds.push(r.id);
  }
  return out;
}

/** Hängt Projekt-Dokumente hinter bereits vorhandenes Referenzmaterial des Turns. */
export function appendProjectDocParts(existing: string | null, parts: string[]): string | null {
  if (parts.length === 0) return existing;
  const joined = parts.join('\n\n---\n\n');
  return existing ? `${existing}\n\n---\n\n${joined}` : joined;
}
