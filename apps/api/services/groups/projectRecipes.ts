/**
 * Die Rezepte eines Projekts als eigener Block im Rezept-Katalog seiner Chats.
 *
 * Ins Projekt geteilte Rezepte (`group_content_shares`, `content_type`
 * `user_text_forms`) stehen ohnehin im Katalog von `rezept_laden`, aber als
 * eine Zeile unter allen System- und eigenen Rezepten. Live 21.11.2026: im
 * Projekt „Bürger*innenanfragen" schrieb das Modell drei Antwortbriefe mit dem
 * Projekt-Rezept und den vierten ohne. Dieses Modul sagt nur, WELCHE Zeilen des
 * Katalogs zum Projekt des Threads gehören; ob die Person ein Rezept sehen darf,
 * hat der Katalog schon entschieden (`listMentionableTextForms`).
 *
 * Zugriff wie bei Projektdateien und -notebooks: aktive Mitgliedschaft im
 * Projekt des Threads, Thread gehört der Person oder ist Team-Chat
 * (`projectThreadScopeSql`).
 */
import { getPostgresInstance } from '../../database/services/PostgresService.js';

import { projectThreadScopeSql } from './projectThreadScope.js';

/**
 * Höchstens so viele Projekt-Rezepte stehen im eigenen Block (die zuletzt
 * geteilten). Der Rest bleibt im allgemeinen Katalog ladbar.
 */
export const PROJECT_RECIPES_LISTED = 12;

export async function getProjectRecipeIds(threadId: string, userId: string): Promise<string[]> {
  const rows = (await getPostgresInstance().query(
    `SELECT gcs.content_id
       FROM ${projectThreadScopeSql('$1', '$2')}
       JOIN group_content_shares gcs ON gcs.group_id = g.id
        AND gcs.content_type = 'user_text_forms'
      WHERE t.deleted_at IS NULL
      ORDER BY gcs.shared_at DESC
      LIMIT $3`,
    [threadId, userId, PROJECT_RECIPES_LISTED]
  )) as Array<{ content_id: string }>;
  return [...new Set(rows.map((r) => r.content_id))];
}
