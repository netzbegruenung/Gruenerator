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

/**
 * Für den Chat-Kontext: der Text eines Projekts, ohne Mitgliedsprüfung — der
 * Aufrufer (`getSpaceRecallScope`) hat sie schon gemacht.
 */
export async function readProjectInstructionsText(groupId: string): Promise<string> {
  const row = (await getPostgresInstance().queryOne(
    `SELECT custom_prompt FROM group_instructions
      WHERE group_id = $1::uuid AND COALESCE(is_active, TRUE) = TRUE
        AND COALESCE(instructions_enabled, FALSE) = TRUE`,
    [groupId]
  )) as { custom_prompt: string | null } | null;
  return row?.custom_prompt?.trim() ?? '';
}
