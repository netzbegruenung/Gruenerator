/**
 * Die Dateien eines Projekts als Material für dessen Chats — ein stilles
 * Notebook.
 *
 * Eine Datei ist ein `documents`-Eintrag der Person, die sie hochgeladen hat,
 * geteilt ins Projekt (`group_content_shares`, `content_type = 'documents'`).
 * Ein Chat, der im Projekt liegt (`chat_threads.group_id`), durchsucht alle
 * fertigen Dateien gemeinsam als EIN Dokument-Scope — derselbe Weg wie die
 * Dokumente eines Nutzer-Notebooks (`defaultNotebookDocumentIds`, gelesen von
 * `agentNotebookDocIds`): eine Suche über alle Dokument-IDs, kein Budget je
 * Datei. Die Suche nach Dokument-ID läuft ohne `user_id`-Filter, deshalb gehört
 * die Zugriffsprüfung hierher.
 *
 * DIE Zugriffsregel steht in der Abfrage, nicht davor: aktive Mitgliedschaft
 * der anfragenden Person im Projekt des Threads. Wer das Projekt verlassen hat,
 * behält den Chat, aber nicht die Dateien. Der Thread muss der Person gehören
 * oder ein Team-Chat des Projekts sein (`projectThreadScopeSql`), sonst würde die
 * Thread-ID eines fremden privaten Chats das Projekt öffnen.
 */
import { getPostgresInstance } from '../../database/services/PostgresService.js';

import { projectThreadScopeSql } from './projectThreadScope.js';

/**
 * Sicherheitsdeckel, kein Auswahlkriterium: eine Suche über viele Dokument-IDs
 * ist ein einziger Qdrant-Filter (`match any`), kostet also nicht je Datei eine
 * Suche. Der Deckel schützt nur vor einer unbegrenzten ID-Liste im Filter eines
 * Projekts mit Tausenden Dateien; die neuesten gewinnen.
 */
export const PROJECT_FILE_DOCUMENT_CAP = 200;

export async function getProjectFileDocumentIds(
  threadId: string,
  userId: string
): Promise<string[]> {
  const rows = (await getPostgresInstance().query(
    `SELECT d.id
       FROM ${projectThreadScopeSql('$1', '$2')}
       JOIN group_content_shares gcs ON gcs.group_id = g.id AND gcs.content_type = 'documents'
       -- content_id ist text (es trägt auch Nicht-UUID-Kennungen), documents.id uuid.
       JOIN documents d ON d.id::text = gcs.content_id
      WHERE d.deleted_at IS NULL AND d.status = 'completed' AND d.user_id IS NOT NULL
      ORDER BY gcs.shared_at DESC
      LIMIT $3`,
    [threadId, userId, PROJECT_FILE_DOCUMENT_CAP]
  )) as { id: string }[];
  return [...new Set(rows.map((r) => r.id))];
}
