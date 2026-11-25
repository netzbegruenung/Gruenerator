import { DEFAULT_INSTANCE_ID, type InstanceId } from '../instances/index.js';

import { isAgentVisibleForLocale, localizeAgent } from './audience.js';
import { getHubMemberAgentIds, getLvAgentIdsHiddenIn } from './landesverbandHubs.js';
import { SYSTEM_AGENTS, VISIBLE_SYSTEM_AGENTS } from './system.js';

import type { Agent } from './types.js';

// The registry-bound halves of `audience.ts`. They live apart because they read
// the full catalogue (`system.ts`); `audience.ts` stays free of it so boot code
// can use its pure helpers — and `slim.ts` its own registry — without pulling
// the opening copy and few-shot examples of every agent into the entry chunk.

/**
 * Convenience: filtered + localized view of every system agent for a user.
 * Mirrors `SYSTEM_AGENTS` but per-locale. Includes inventory-hidden agents
 * — callers that need the public list should compose with `VISIBLE_SYSTEM_AGENTS`.
 */
export function getSystemAgentsForLocale(userLocale: string): readonly Agent[] {
  return SYSTEM_AGENTS.filter((a) => isAgentVisibleForLocale(a, userLocale)).map((a) =>
    localizeAgent(a, userLocale)
  );
}

/**
 * Convenience: the public, locale-filtered, localized inventory list for one
 * instance. The right starting point for sidebar / picker UIs that want a clean
 * per-user view of available agents.
 *
 * The instance gate only removes Landesverband specialists whose notebook the
 * instance does not offer — the hub owns that relation, so nothing here names
 * an agent. Resolution by identifier stays untouched (`getSystemAgent`), so
 * existing threads and direct links keep working exactly as with the locale
 * filter above.
 */
export function getVisibleSystemAgentsForLocale(
  userLocale: string,
  instanceId: InstanceId = DEFAULT_INSTANCE_ID
): readonly Agent[] {
  const hiddenLvAgents = getLvAgentIdsHiddenIn(instanceId);
  return VISIBLE_SYSTEM_AGENTS.filter(
    (a) => !hiddenLvAgents.has(a.identifier) && isAgentVisibleForLocale(a, userLocale)
  ).map((a) => localizeAgent(a, userLocale));
}

/**
 * Die Agenten, die ein Instanz-Admin einzeln kuratieren kann.
 *
 * **Ohne Locale-Filter**, anders als {@link getVisibleSystemAgentsForLocale}:
 * wer den Katalog der Instanz pflegt, soll sehen, was sie führt — nicht, was
 * der eigene Spracheinstellung gerade zeigt.
 *
 * **Ohne die Landesverbands-Spezialisten.** Sie werden über ihren Hub erreicht
 * und über die Instanz-Registry kuratiert (`hide.notebookCategories`), nicht
 * einzeln: 36 Zeilen für zwölf Landesverbände wären Kleinteiligkeit, die
 * niemand braucht, und ein einzeln versteckter Spezialist stünde quer zu der
 * Kaskade, die seine Rezepte und sein Notebook gemeinsam schaltet.
 */
export function getCuratableSystemAgents(
  instanceId: InstanceId = DEFAULT_INSTANCE_ID
): readonly Agent[] {
  const hiddenLvAgents = getLvAgentIdsHiddenIn(instanceId);
  const hubMembers = getHubMemberAgentIds();
  return VISIBLE_SYSTEM_AGENTS.filter(
    (a) => !hiddenLvAgents.has(a.identifier) && !hubMembers.has(a.identifier)
  );
}
