/**
 * Die Dateien eines Projekts als Material für dessen Chats.
 *
 * Eine Datei ist ein `documents`-Eintrag der Person, die sie hochgeladen hat,
 * geteilt ins Projekt (`group_content_shares`, `content_type = 'documents'`).
 * Ein Chat, der im Projekt liegt (`chat_threads.group_id`), bekommt sie als
 * übergebene Dokumentquellen — derselbe Weg wie Dokumente aus dem
 * Notebook-Reader: gelesen wird mit der `ownerUserId` des Hochladenden, weil die
 * Suche nach Dokument-ID ohne `user_id`-Filter läuft.
 *
 * DIE Zugriffsregel steht in der Abfrage, nicht davor: aktive Mitgliedschaft
 * der anfragenden Person im Projekt des Threads. Wer das Projekt verlassen hat,
 * behält den Chat, aber nicht die Dateien. Der Thread muss der Person gehören
 * oder ein Team-Chat des Projekts sein (`projectThreadScopeSql`), sonst würde die
 * Thread-ID eines fremden privaten Chats das Projekt öffnen.
 */
import { getPostgresInstance } from '../../database/services/PostgresService.js';

import { projectThreadScopeSql } from './projectThreadScope.js';

import type { ResolvedNotebookSource } from '../../agents/langgraph/ChatGraph/types.js';

/**
 * Obergrenze je Turn. Der Fan-out teilt sein Budget durch die Zahl der Quellen
 * (`max(3, ⌊12/N⌋)` je Dokument) und kostet je Quelle eine Suche; ein Projekt
 * mit 40 Dateien würde jeden Turn 40 Suchen zahlen. Die neuesten gewinnen.
 */
export const PROJECT_FILES_PER_TURN = 8;

interface ProjectFileRow {
  id: string;
  title: string | null;
  filename: string | null;
  user_id: string;
}

export async function getProjectFileSources(
  threadId: string,
  userId: string,
  limit = PROJECT_FILES_PER_TURN
): Promise<ResolvedNotebookSource[]> {
  const rows = (await getPostgresInstance().query(
    `SELECT d.id, d.title, d.filename, d.user_id
       FROM ${projectThreadScopeSql('$1', '$2')}
       JOIN group_content_shares gcs ON gcs.group_id = g.id AND gcs.content_type = 'documents'
       -- content_id ist text (es trägt auch Nicht-UUID-Kennungen), documents.id uuid.
       JOIN documents d ON d.id::text = gcs.content_id
      WHERE d.deleted_at IS NULL AND d.status = 'completed' AND d.user_id IS NOT NULL
      ORDER BY gcs.shared_at DESC
      LIMIT $3`,
    [threadId, userId, limit]
  )) as ProjectFileRow[];
  return rows.map((r) => ({
    kind: 'user' as const,
    documentId: r.id,
    notebookId: null,
    ownerUserId: r.user_id,
    title: r.title?.trim() || r.filename?.trim() || 'Datei',
  }));
}
