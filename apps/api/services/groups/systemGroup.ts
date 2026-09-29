/**
 * Das System-Projekt „Grünerator": genau eine Gruppe (`groups.is_system`), in
 * der jedes Profil Mitglied ist. Mitgliedschaft ist materialisiert — eine
 * echte `group_memberships`-Zeile pro Profil —, damit alle bestehenden
 * Zugriffsprüfungen (Docs, Threads, Notebooks, Boards, Feed) ohne Sonderfall
 * greifen. Im Gegenzug gibt die Gruppe keine Mitgliederinfos heraus, und nur
 * Instanz-Admins dürfen teilen (`assertCanShareToGroup`).
 */
import { generateSlugSuffix } from '@gruenerator/shared/utils';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('systemGroup');

export const SYSTEM_GROUP_NAME = 'Grünerator';
const SYSTEM_GROUP_DESCRIPTION = 'Neuigkeiten, Vorlagen und Tipps vom Grünerator-Team für alle.';

/**
 * Legt die System-Gruppe an, falls sie fehlt, und macht jedes Profil zum
 * Mitglied. Läuft bei jedem Boot: beides ist idempotent, und der Sweep heilt
 * Profile, bei denen `addUserToSystemGroup` im Auth-Hook fehlgeschlagen ist.
 * Keine Benachrichtigungen — das ist keine Beitrittsaktion.
 */
export async function ensureSystemGroup(): Promise<void> {
  const postgres = getPostgresInstance();
  try {
    await postgres.query(
      `INSERT INTO groups (name, description, created_by, group_type, is_public, audience, slug_suffix, is_system)
       VALUES ($1, $2, NULL, 'standard', FALSE, 'all', $3, TRUE)
       ON CONFLICT ((is_system)) WHERE is_system DO NOTHING`,
      [SYSTEM_GROUP_NAME, SYSTEM_GROUP_DESCRIPTION, generateSlugSuffix()]
    );
    const added = await postgres.query<{ user_id: string }>(
      `INSERT INTO group_memberships (group_id, user_id, role)
       SELECT g.id, p.id, 'member' FROM groups g CROSS JOIN profiles p
       WHERE g.is_system AND g.deleted_at IS NULL
       ON CONFLICT (group_id, user_id) DO NOTHING
       RETURNING user_id`
    );
    log.info(`[ensureSystemGroup] ready, added ${added.length} member(s)`);
  } catch (error) {
    log.warn('[ensureSystemGroup] failed (will retry on next boot):', (error as Error).message);
  }
}

/** Neues Profil in die System-Gruppe aufnehmen. Fehler nur loggen — der Boot-Sweep holt es nach. */
export async function addUserToSystemGroup(userId: string): Promise<void> {
  try {
    await getPostgresInstance().query(
      `INSERT INTO group_memberships (group_id, user_id, role)
       SELECT id, $1, 'member' FROM groups WHERE is_system AND deleted_at IS NULL
       ON CONFLICT (group_id, user_id) DO NOTHING`,
      [userId]
    );
  } catch (error) {
    log.warn('[addUserToSystemGroup] failed:', userId, (error as Error).message);
  }
}

export async function isSystemGroup(groupId: string): Promise<boolean> {
  const row = await getPostgresInstance().queryOne(
    'SELECT is_system FROM groups WHERE id = $1 AND deleted_at IS NULL',
    [groupId],
    { table: 'groups' }
  );
  return Boolean(row?.is_system);
}

// Contains "Berechtigung" so `groupErrorResponse` maps the throw to a 403.
export const SYSTEM_GROUP_FORBIDDEN =
  'Keine Berechtigung: Das Grünerator-Projekt lässt sich so nicht ändern.';
