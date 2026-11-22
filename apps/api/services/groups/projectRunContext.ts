/**
 * Das Material eines Projekts für Läufe OHNE Thread (wiederkehrende Aufgaben, #5939).
 *
 * Ein Projekt-Chat bekommt Anweisungen, Dateien, Notebooks und Rezepte über den
 * Thread (`readThreadProjectInstructions`, `getProjectFileDocumentIds`,
 * `getProjectNotebookIds`, `getProjectRecipeIds`). Ein Lauf hat keinen Thread,
 * sondern eine Projekt-Id; hier stehen dieselben Abfragen nach Projekt statt nach
 * Thread. Die Zugriffsregel bleibt: die Person muss zur Laufzeit AKTIVES Mitglied
 * eines nicht gelöschten, aktiven Projekts sein — sonst `null`, und der Aufrufer
 * läuft ohne Projekt. Obergrenzen und Auswahl sind die der Thread-Leser.
 */
import { getPostgresInstance } from '../../database/services/PostgresService.js';

import { PROJECT_COLLAB_SEARCH_CAP } from './projectCollabDocs.js';
import { PROJECT_FILE_DOCUMENT_CAP } from './projectFiles.js';
import {
  PROJECT_NOTEBOOKS_PER_TURN,
  selectProjectNotebooks,
  type ProjectNotebookShare,
} from './projectNotebooks.js';
import { PROJECT_RECIPES_LISTED } from './projectRecipes.js';
import { projectThreadScopeSql } from './projectThreadScope.js';

export interface ProjectRunContext {
  groupId: string;
  projectInstructions: { projectName: string; text: string } | null;
  projectNotebookIds: string[];
  projectRecipeIds: string[];
  /** Alle Dateien und indexierten Dokumente des Projekts als ein Suchbereich (stilles Notebook, wie im Projekt-Chat). */
  projectFileDocumentIds: string[];
}

/** Projekt-Name, wenn die Person aktives Mitglied eines lebenden Projekts ist, sonst `null`. */
export async function getActiveProjectName(
  groupId: string,
  userId: string
): Promise<string | null> {
  const row = (await getPostgresInstance().queryOne(
    `SELECT g.name
       FROM groups g
       JOIN group_memberships gm ON gm.group_id = g.id AND gm.user_id = $2::uuid
        AND gm.is_active = TRUE
      WHERE g.id = $1::uuid AND g.deleted_at IS NULL AND COALESCE(g.is_active, TRUE) = TRUE`,
    [groupId, userId]
  )) as { name: string } | null;
  return row?.name ?? null;
}

export async function loadProjectRunContext(
  groupId: string,
  userId: string
): Promise<ProjectRunContext | null> {
  const projectName = await getActiveProjectName(groupId, userId);
  if (projectName == null) return null;
  const db = getPostgresInstance();

  const [instr, notebookRows, recipeRows, fileRows, collabRows] = await Promise.all([
    db.queryOne(
      `SELECT custom_prompt FROM group_instructions
        WHERE group_id = $1::uuid AND COALESCE(is_active, TRUE) = TRUE
          AND COALESCE(instructions_enabled, FALSE) = TRUE`,
      [groupId]
    ) as Promise<{ custom_prompt: string | null } | null>,
    db.query(
      `SELECT content_type, content_id FROM group_content_shares
        WHERE group_id = $1::uuid AND content_type IN ('system_notebooks', 'notebook_collections')
        ORDER BY shared_at DESC LIMIT $2`,
      [groupId, PROJECT_NOTEBOOKS_PER_TURN * 3]
    ) as Promise<Array<{ content_type: ProjectNotebookShare['contentType']; content_id: string }>>,
    db.query(
      `SELECT content_id FROM group_content_shares
        WHERE group_id = $1::uuid AND content_type = 'user_text_forms'
        ORDER BY shared_at DESC LIMIT $2`,
      [groupId, PROJECT_RECIPES_LISTED]
    ) as Promise<Array<{ content_id: string }>>,
    db.query(
      `SELECT d.id
         FROM group_content_shares gcs
         JOIN documents d ON d.id::text = gcs.content_id
        WHERE gcs.group_id = $1::uuid AND gcs.content_type = 'documents'
          AND d.deleted_at IS NULL AND d.status = 'completed' AND d.user_id IS NOT NULL
        ORDER BY gcs.shared_at DESC LIMIT $2`,
      [groupId, PROJECT_FILE_DOCUMENT_CAP]
    ) as Promise<Array<{ id: string }>>,
    db.query(
      `SELECT cd.id
         FROM group_content_shares gcs
         JOIN collaborative_documents cd ON cd.id::text = gcs.content_id
         JOIN collab_search_index ci ON ci.document_id = cd.id AND ci.chunk_count > 0
        WHERE gcs.group_id = $1::uuid AND gcs.content_type = 'collaborative_documents'
          AND cd.deleted_at IS NULL AND cd.is_deleted = false
        ORDER BY gcs.shared_at DESC LIMIT $2`,
      [groupId, PROJECT_COLLAB_SEARCH_CAP]
    ) as Promise<Array<{ id: string }>>,
  ]);

  const text = instr?.custom_prompt?.trim() ?? '';
  return {
    groupId,
    projectInstructions: text ? { projectName, text } : null,
    projectNotebookIds: selectProjectNotebooks(
      notebookRows.map((r) => ({ contentType: r.content_type, contentId: r.content_id }))
    ),
    projectRecipeIds: [...new Set(recipeRows.map((r) => r.content_id))],
    projectFileDocumentIds: [...new Set([...fileRows, ...collabRows].map((r) => r.id))],
  };
}

/**
 * Projekt, in dem ein Chat liegt, wenn die Person es nutzen darf (aktives
 * Mitglied, eigener oder Team-Chat) — Standard-Projekt einer im Chat angelegten
 * Aufgabe. Sonst `null`.
 */
export async function getThreadProjectId(threadId: string, userId: string): Promise<string | null> {
  const row = (await getPostgresInstance().queryOne(
    `SELECT g.id FROM ${projectThreadScopeSql('$1', '$2')}`,
    [threadId, userId]
  )) as { id: string } | null;
  return row?.id ?? null;
}
