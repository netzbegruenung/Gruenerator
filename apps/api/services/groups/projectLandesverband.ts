/**
 * Der Landesverband, den Projekt-Admins einem Projekt ausdrücklich gegeben
 * haben (`groups.landesverband`). Im Chat gewinnt er gegen die aktive Rolle der
 * Person — dieselbe Rangfolge wie bei einem LV-Agenten (`lvRecipePreference`).
 */
import { type LandesverbandId } from '@gruenerator/contracts';

import { getPostgresInstance } from '../../database/services/PostgresService.js';

import { projectThreadScopeSql } from './projectThreadScope.js';

/**
 * Der Landesverband des Projekts, in dem ein Chat liegt. Gleiche Zugangsregel
 * wie die Projekt-Anweisungen (`projectThreadScopeSql`: aktives Mitglied, eigener
 * Chat oder Team-Chat, Projekt nicht gelöscht). `null`, wenn der Chat in keinem
 * Projekt liegt oder das Projekt keinen Landesverband trägt.
 */
export async function readThreadProjectLandesverband(
  threadId: string,
  userId: string
): Promise<LandesverbandId | null> {
  const row = (await getPostgresInstance().queryOne(
    `SELECT g.landesverband FROM ${projectThreadScopeSql('$1', '$2')}`,
    [threadId, userId]
  )) as { landesverband: LandesverbandId | null } | null;
  return row?.landesverband ?? null;
}
