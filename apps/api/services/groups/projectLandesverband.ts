/**
 * Die Rezept-Einstellungen eines Projekts: der Landesverband, den
 * Projekt-Admins ihm ausdrücklich gegeben haben (`groups.landesverband`), und
 * der Schalter „Nur Projekt-Rezepte verwenden" (`groups.recipes_exclusive`).
 * Im Chat gewinnt der Landesverband gegen die aktive Rolle der Person —
 * dieselbe Rangfolge wie bei einem LV-Agenten (`lvRecipePreference`).
 */
import { type LandesverbandId } from '@gruenerator/contracts';

import { getPostgresInstance } from '../../database/services/PostgresService.js';

import { projectThreadScopeSql } from './projectThreadScope.js';

export interface ThreadProjectRecipeSettings {
  landesverband: LandesverbandId | null;
  recipesExclusive: boolean;
}

/**
 * Die Einstellungen des Projekts, in dem ein Chat liegt. Gleiche Zugangsregel
 * wie die Projekt-Anweisungen (`projectThreadScopeSql`: aktives Mitglied, eigener
 * Chat oder Team-Chat, Projekt nicht gelöscht). `null`, wenn der Chat in keinem
 * Projekt liegt.
 */
export async function readThreadProjectRecipeSettings(
  threadId: string,
  userId: string
): Promise<ThreadProjectRecipeSettings | null> {
  const row = (await getPostgresInstance().queryOne(
    `SELECT g.landesverband, g.recipes_exclusive FROM ${projectThreadScopeSql('$1', '$2')}`,
    [threadId, userId]
  )) as { landesverband: LandesverbandId | null; recipes_exclusive: boolean | null } | null;
  if (!row) return null;
  return {
    landesverband: row.landesverband ?? null,
    recipesExclusive: row.recipes_exclusive === true,
  };
}
