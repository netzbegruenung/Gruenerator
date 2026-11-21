/**
 * Die Notebooks eines Projekts als Vorgabe-Suche seiner Chats.
 *
 * Ein Notebook, das ins Projekt geteilt ist (`group_content_shares`,
 * `content_type` `system_notebooks` = Slug bzw. `notebook_collections` =
 * Nutzer-Notebook-UUID), wird in Chats des Projekts ohne @-Erwähnung
 * durchsucht — derselbe Weg wie `defaultNotebookIds` eines Agents
 * (`ChatGraph.ts`): System-Slugs über das implizite Tor, Nutzer-Notebooks als
 * Dokument-IDs. Eine ausdrückliche @notebook-Wahl des Turns schlägt die
 * Vorgabe weiterhin (dieselbe Regel wie beim Agenten, weiter unten im Graph).
 *
 * Zugriff wie bei den Projektdateien: aktive Mitgliedschaft im Projekt des
 * Threads, Thread gehört der Person oder ist Team-Chat (`projectThreadScopeSql`).
 * Das Projekt-Share IST der Lesegrant für Mitglieder; ein Nicht-Mitglied
 * bekommt über die Thread-ID nichts.
 */
import { isNotebookImplicitlySearchable } from '../../config/notebookCollectionMap.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { createLogger } from '../../utils/logger.js';

import { projectThreadScopeSql } from './projectThreadScope.js';

const log = createLogger('projectNotebooks');

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

export interface ProjectNotebookScope {
  /** System-Notebook-Slugs, durch das implizite Tor gelassen. */
  systemSlugs: string[];
  /** Nutzer-Notebook-UUIDs. */
  userNotebookIds: string[];
}

export const EMPTY_PROJECT_NOTEBOOK_SCOPE: ProjectNotebookScope = {
  systemSlugs: [],
  userNotebookIds: [],
};

/**
 * Rein: aus den Shares (neueste zuerst) die Vorgabe dieses Turns. Ein auf dieser
 * Instanz verborgenes System-Notebook wird nie zur Vorgabe, zählt aber auch
 * nicht gegen die Obergrenze.
 */
export function selectProjectNotebooks(
  shares: readonly ProjectNotebookShare[],
  limit = PROJECT_NOTEBOOKS_PER_TURN
): ProjectNotebookScope {
  const systemSlugs: string[] = [];
  const userNotebookIds: string[] = [];
  const seen = new Set<string>();
  for (const share of shares) {
    if (systemSlugs.length + userNotebookIds.length >= limit) break;
    if (seen.has(share.contentId)) continue;
    seen.add(share.contentId);
    if (share.contentType === 'system_notebooks') {
      if (isNotebookImplicitlySearchable(share.contentId)) systemSlugs.push(share.contentId);
    } else {
      userNotebookIds.push(share.contentId);
    }
  }
  return { systemSlugs, userNotebookIds };
}

interface ShareRow {
  content_type: ProjectNotebookShare['contentType'];
  content_id: string;
}

export async function getProjectNotebookScope(
  threadId: string,
  userId: string
): Promise<ProjectNotebookScope> {
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

/**
 * Dokument-IDs der geteilten Nutzer-Notebooks. Der Zugriff ist durch den
 * Projekt-Share und die Mitgliedschaft bereits entschieden (siehe oben).
 */
export async function resolveProjectUserNotebookDocs(
  notebookIds: readonly string[]
): Promise<{ documentIds: string[]; documentNotebookIds: Record<string, string> }> {
  const documentNotebookIds: Record<string, string> = {};
  if (notebookIds.length === 0) return { documentIds: [], documentNotebookIds };
  const { NotebookQdrantHelper } = await import('../../database/services/NotebookQdrantHelper.js');
  const helper = new NotebookQdrantHelper();
  for (const id of notebookIds) {
    try {
      for (const d of await helper.getCollectionDocuments(id)) {
        if (d.document_id) documentNotebookIds[d.document_id] ??= id;
      }
    } catch (err) {
      log.warn(`Could not read project notebook ${id} (skipped):`, err);
    }
  }
  return { documentIds: Object.keys(documentNotebookIds), documentNotebookIds };
}
