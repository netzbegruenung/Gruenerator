/**
 * Die Tabellen, deren Zeilen in den Papierkorb wandern, und die eine Klausel,
 * mit der Drizzle-Leser sie ausblenden.
 *
 * Getrashte Zeilen bleiben physisch stehen und tragen `deleted_at`; jeder
 * Leser einer dieser Tabellen muss sie ausblenden. `services/trash/
 * trashReaders.vitest.ts` liest den Quelltext und hält das fest.
 * `user_documents` hat kein Drizzle-Schema und wird nur roh abgefragt.
 */
import { isNull, type SQL } from 'drizzle-orm';
import { type PgColumn } from 'drizzle-orm/pg-core';

import { chatThreads } from './schema/chat.js';
import { collaborative_documents } from './schema/collaborative.js';
import { documents } from './schema/documents.js';
import { explainables } from './schema/explainables.js';
import { customPrompts } from './schema/generators.js';
import { groups } from './schema/groups.js';
import { userKnowledge } from './schema/knowledge.js';
import { sharedMedia } from './schema/media.js';
import { recurring_tasks } from './schema/recurringTasks.js';
import { reisekostenAbrechnungen } from './schema/reisekosten.js';
import { userSites } from './schema/sites.js';
import { subtitlerProjects } from './schema/subtitler.js';
import { userTemplates } from './schema/templates.js';
import { userTextForms } from './schema/textForms.js';
import { userAgents } from './schema/userAgents.js';
import { userLetterheads } from './schema/userLetterheads.js';

export const TRASHABLE_TABLES = {
  collaborative_documents,
  chat_threads: chatThreads,
  documents,
  shared_media: sharedMedia,
  subtitler_projects: subtitlerProjects,
  user_agents: userAgents,
  user_templates: userTemplates,
  user_text_forms: userTextForms,
  custom_prompts: customPrompts,
  user_sites: userSites,
  recurring_tasks,
  user_letterheads: userLetterheads,
  user_documents: null,
  user_knowledge: userKnowledge,
  groups,
  reisekosten_abrechnungen: reisekostenAbrechnungen,
  explainables,
} as const;

export type TrashableTableName = keyof typeof TRASHABLE_TABLES;

/** `WHERE deleted_at IS NULL` für einen Drizzle-Leser einer Papierkorb-Tabelle. */
export function notTrashed(table: { deleted_at: PgColumn }): SQL {
  return isNull(table.deleted_at);
}
