/**
 * Projekt-Start: eine kurze Begrüßung und bis zu vier Startfragen, die die
 * Übersicht über dem „Neuer Chat in …"-Feld zeigt. Ein Klick auf eine Frage
 * startet einen Projekt-Chat damit. Lesen dürfen Mitglieder, schreiben
 * Projekt-Admins (im System-Projekt nur Instanz-Admins) — beides über
 * `getPostgresAndCheckMembership`.
 *
 * Liegt in der Zeile von `group_instructions`; die Anweisungs-Leser filtern auf
 * `instructions_enabled`, ein Start ohne Anweisungen bleibt für sie unsichtbar.
 */
import {
  GROUP_START_QUESTION_MAX,
  GROUP_START_QUESTIONS_MAX,
  GROUP_WELCOME_MAX,
} from '@gruenerator/contracts';

import { getPostgresAndCheckMembership } from './groupMembership.js';

export interface ProjectStart {
  welcomeMessage: string;
  startQuestions: string[];
}

const EMPTY: ProjectStart = { welcomeMessage: '', startQuestions: [] };

/** Trimmt, kappt auf die Grenzen der Verträge und wirft leere Fragen weg. */
export function normalizeProjectStart(input: {
  welcomeMessage?: string | null;
  startQuestions?: readonly unknown[] | null;
}): ProjectStart {
  const questions = (input.startQuestions ?? [])
    .filter((q): q is string => typeof q === 'string')
    .map((q) => q.trim().slice(0, GROUP_START_QUESTION_MAX))
    .filter((q) => q.length > 0)
    .slice(0, GROUP_START_QUESTIONS_MAX);
  return {
    welcomeMessage: (input.welcomeMessage ?? '').trim().slice(0, GROUP_WELCOME_MAX),
    startQuestions: questions,
  };
}

interface StartDbRow {
  welcome_message: string | null;
  start_questions: unknown;
}

function toResult(row: StartDbRow | null): ProjectStart {
  if (!row) return EMPTY;
  return normalizeProjectStart({
    welcomeMessage: row.welcome_message,
    startQuestions: Array.isArray(row.start_questions) ? row.start_questions : [],
  });
}

/** Für Mitglieder: wirft („Du bist nicht Mitglied …"), wenn die Person keines ist. */
export async function getProjectStart(groupId: string, userId: string): Promise<ProjectStart> {
  const { postgres } = await getPostgresAndCheckMembership(groupId, userId);
  const row = (await postgres.queryOne(
    `SELECT welcome_message, start_questions FROM group_instructions
      WHERE group_id = $1::uuid AND COALESCE(is_active, TRUE) = TRUE`,
    [groupId]
  )) as StartDbRow | null;
  return toResult(row);
}

/** Für Admins: wirft sonst. Leere Begrüßung und keine Fragen leeren den Start. */
export async function setProjectStart(
  groupId: string,
  userId: string,
  input: { welcomeMessage: string; startQuestions: readonly string[] }
): Promise<ProjectStart> {
  const { postgres } = await getPostgresAndCheckMembership(groupId, userId, true);
  const start = normalizeProjectStart(input);
  await postgres.queryOne(
    `INSERT INTO group_instructions (group_id, welcome_message, start_questions, is_active)
     VALUES ($1::uuid, $2, $3::jsonb, TRUE)
     ON CONFLICT (group_id) DO UPDATE
       SET welcome_message = EXCLUDED.welcome_message,
           start_questions = EXCLUDED.start_questions,
           is_active = TRUE
     RETURNING welcome_message`,
    [groupId, start.welcomeMessage, JSON.stringify(start.startQuestions)]
  );
  return start;
}
