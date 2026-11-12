/**
 * Projekt-Anweisungen: ein Text, den die Admins eines Projekts für alle Chats
 * darin hinterlegen („Antworte im Du, kurze Sätze, Zielgruppe Neumitglieder").
 *
 * Eine Zeile je Projekt in `group_instructions` (group_id UNIQUE). Der Text
 * steht in `custom_prompt`; `instructions_enabled` spiegelt „Text vorhanden",
 * damit ein gelöschter Text die Zeile nicht als aktive Anweisung stehen lässt.
 * Lesen dürfen Mitglieder, schreiben Projekt-Admins (im System-Projekt nur
 * Instanz-Admins) — beides über `getPostgresAndCheckMembership`.
 */
import { GROUP_INSTRUCTIONS_MAX } from '@gruenerator/contracts';

import { getPostgresInstance } from '../../database/services/PostgresService.js';

import { getPostgresAndCheckMembership } from './groupMembership.js';

import type { GroupInstructionsRow } from '../../database/schema/groups.js';

export interface ProjectInstructions {
  instructions: string;
  updatedAt: string | null;
}

type InstructionsDbRow = Pick<GroupInstructionsRow, 'custom_prompt' | 'updated_at'> & {
  updated_at: Date | string | null;
};

const EMPTY: ProjectInstructions = { instructions: '', updatedAt: null };

function toResult(row: InstructionsDbRow | null): ProjectInstructions {
  if (!row) return EMPTY;
  const updated = row.updated_at;
  return {
    instructions: row.custom_prompt ?? '',
    updatedAt: updated == null ? null : updated instanceof Date ? updated.toISOString() : updated,
  };
}

/** Für Mitglieder: wirft („Du bist nicht Mitglied …"), wenn die Person keines ist. */
export async function getProjectInstructions(
  groupId: string,
  userId: string
): Promise<ProjectInstructions> {
  const { postgres } = await getPostgresAndCheckMembership(groupId, userId);
  const row = (await postgres.queryOne(
    `SELECT custom_prompt, updated_at FROM group_instructions
      WHERE group_id = $1::uuid AND COALESCE(is_active, TRUE) = TRUE
        AND COALESCE(instructions_enabled, FALSE) = TRUE`,
    [groupId]
  )) as InstructionsDbRow | null;
  return toResult(row);
}

/** Für Admins: wirft sonst. Leerer Text entfernt die Anweisungen. */
export async function setProjectInstructions(
  groupId: string,
  userId: string,
  text: string
): Promise<ProjectInstructions> {
  const { postgres } = await getPostgresAndCheckMembership(groupId, userId, true);
  const trimmed = text.trim().slice(0, GROUP_INSTRUCTIONS_MAX);
  const row = (await postgres.queryOne(
    `INSERT INTO group_instructions (group_id, custom_prompt, instructions_enabled, is_active)
     VALUES ($1::uuid, $2, $3, TRUE)
     ON CONFLICT (group_id) DO UPDATE
       SET custom_prompt = EXCLUDED.custom_prompt,
           instructions_enabled = EXCLUDED.instructions_enabled,
           is_active = TRUE
     RETURNING custom_prompt, updated_at`,
    [groupId, trimmed, trimmed.length > 0]
  )) as InstructionsDbRow | null;
  return trimmed ? toResult(row) : EMPTY;
}

export interface ThreadProjectInstructions {
  projectName: string;
  text: string;
}

/**
 * Die Anweisungen des Projekts, in dem ein Chat liegt — für den Systemprompt.
 * Nur der eigene Chat (wie der Projekt-Block in `getSpaceRecallScope`), nur
 * für aktive Mitglieder, nur ein nicht gelöschtes Projekt. `null`, wenn der
 * Chat in keinem Projekt liegt oder es keine Anweisungen gibt.
 */
export async function readThreadProjectInstructions(
  threadId: string,
  userId: string
): Promise<ThreadProjectInstructions | null> {
  const row = (await getPostgresInstance().queryOne(
    `SELECT g.name, gi.custom_prompt
       FROM chat_threads t
       JOIN groups g ON g.id = t.group_id AND g.deleted_at IS NULL
         AND COALESCE(g.is_active, TRUE) = TRUE
       JOIN group_memberships gm ON gm.group_id = g.id AND gm.user_id = $2::uuid
         AND gm.is_active = TRUE
       JOIN group_instructions gi ON gi.group_id = g.id
         AND COALESCE(gi.is_active, TRUE) = TRUE
         AND COALESCE(gi.instructions_enabled, FALSE) = TRUE
      WHERE t.id = $1::uuid AND t.user_id = $2::uuid AND t.deleted_at IS NULL`,
    [threadId, userId]
  )) as { name: string; custom_prompt: string | null } | null;
  const text = row?.custom_prompt?.trim() ?? '';
  return row && text ? { projectName: row.name, text } : null;
}
