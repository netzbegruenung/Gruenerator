/**
 * Die Notebooks eines Projekts als Vorgabe-Suche seiner Chats.
 *
 * Ein Notebook, das ins Projekt geteilt ist (`group_content_shares`,
 * `content_type` `system_notebooks` = Slug bzw. `notebook_collections` =
 * Nutzer-Notebook-UUID), wird in Chats des Projekts ohne @-Erwähnung
 * durchsucht. Gebunden wird es genau wie die `defaultNotebookIds` eines Agents
 * (`initializeChatState` in `ChatGraph.ts`): System-Slugs über das implizite
 * Tor, Nutzer-Notebooks über `resolveUserNotebookDocumentIds`, also mit
 * `checkNotebookAccess`. Dieses Modul entscheidet deshalb nur, WELCHE Ids ein
 * Projekt-Thread mitbringt; ob die Person ein Nutzer-Notebook lesen darf (es
 * liegt nicht im Papierkorb, ist nicht wieder privat, nicht entfernt), prüft
 * dieselbe Stelle wie beim Agent. Eine ausdrückliche @notebook-Wahl des Turns
 * schlägt die Vorgabe weiterhin.
 *
 * Zugriff auf die Liste wie bei den Projektdateien: aktive Mitgliedschaft im
 * Projekt des Threads, Thread gehört der Person oder ist Team-Chat
 * (`projectThreadScopeSql`).
 */
import { isNotebookImplicitlySearchable } from '../../config/notebookCollectionMap.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';

import { projectThreadScopeSql } from './projectThreadScope.js';

/**
 * Obergrenze je Turn (System- und Nutzer-Notebooks zusammen, die zuletzt
 * geteilten gewinnen). Jedes Notebook weitet die Suche des Turns; ein Projekt
 * mit 30 Notebooks würde sonst jede Frage über alles fächern.
 */
export const PROJECT_NOTEBOOKS_PER_TURN = 8;

export interface ProjectNotebookShare {
  contentType: 'system_notebooks' | 'notebook_collections';
  contentId: string;
}

/**
 * Rein: aus den Shares (neueste zuerst) die Notebook-Ids dieses Turns. Ein auf
 * dieser Instanz verborgenes System-Notebook fällt schon hier heraus, damit es
 * keinen Platz unter der Obergrenze belegt (gebunden würde es ohnehin nicht).
 */
export function selectProjectNotebooks(
  shares: readonly ProjectNotebookShare[],
  limit = PROJECT_NOTEBOOKS_PER_TURN
): string[] {
  const ids: string[] = [];
  for (const share of shares) {
    if (ids.length >= limit) break;
    if (ids.includes(share.contentId)) continue;
    if (
      share.contentType === 'system_notebooks' &&
      !isNotebookImplicitlySearchable(share.contentId)
    )
      continue;
    ids.push(share.contentId);
  }
  return ids;
}

interface ShareRow {
  content_type: ProjectNotebookShare['contentType'];
  content_id: string;
}

export async function getProjectNotebookIds(threadId: string, userId: string): Promise<string[]> {
  // Mehr holen als die Obergrenze: verborgene System-Notebooks fallen danach weg.
  const rows = (await getPostgresInstance().query(
    `SELECT gcs.content_type, gcs.content_id
       FROM ${projectThreadScopeSql('$1', '$2')}
       JOIN group_content_shares gcs ON gcs.group_id = g.id
        AND gcs.content_type IN ('system_notebooks', 'notebook_collections')
      WHERE t.deleted_at IS NULL
      ORDER BY gcs.shared_at DESC
      LIMIT $3`,
    [threadId, userId, PROJECT_NOTEBOOKS_PER_TURN * 3]
  )) as ShareRow[];
  return selectProjectNotebooks(
    rows.map((r) => ({ contentType: r.content_type, contentId: r.content_id }))
  );
}
