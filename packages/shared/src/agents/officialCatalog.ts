/**
 * Der offizielle Katalog — System-Agents und Katalog-Rezepte, so gefiltert, wie
 * eine Person sie entdecken darf. Eine Funktion für Server (Marktplatz), Web und
 * Mobile; vorher lebte dieselbe Filterung zweimal und lief auseinander (Web
 * ignorierte `webOnly`, Mobile die Admin-Sperre für Agents).
 *
 * Gilt die Vereinigung der Regeln beider Kopien:
 *   - Locale und Instanz (`getVisibleSystemAgentsForLocale`, `isSkillOfferedIn`)
 *   - Admin-Sperren für Agents und Rezepte, überall
 *   - `webOnly` nur auf `platform: 'mobile'` — für Agents und für Rezepte, deren
 *     besitzender Agent dort fehlt (sie öffneten einen Chat, den die App nicht kann)
 *   - Landesverbands-Zuteilung: `lvIds === null` heißt „Rollen noch nicht geladen"
 *     und lässt durch, `[]` heißt „keine Zuteilung" und blendet LV-Inhalte aus
 *
 * Nur Entdeckung: `getSystemAgent` und `resolveSkillMention` bleiben ungefiltert.
 */
import { type InstanceId } from '../instances/index.js';

import { isAdminVisibleAgent } from './agentVisibility.js';
import {
  getVisibleSystemAgentsForLocale,
  isAgentVisibleForPlatform,
  matchesRecipeAudience,
} from './audience.js';
import { isLandesverbandIdentifier } from './landesverbaende.js';
import { isLvItemVisibleForRoles } from './landesverbandForRoles.js';
import { isSkillOfferedIn } from './skillInstances.js';
import { SKILLS } from './skills/index.js';
import { isAdminVisibleSkill } from './skillVisibility.js';
import { getSystemAgent } from './system.js';

import type { Agent, Skill } from './types.js';

export interface OfficialCatalogInput<S extends Skill = Skill> {
  locale: string;
  instanceId: InstanceId;
  platform: 'web' | 'mobile';
  hiddenAgentIds: readonly string[];
  hiddenSkillMentions: readonly string[];
  lvIds: readonly string[] | null;
  /**
   * Die Rezeptliste, aus der gefiltert wird — Vorgabe `SKILLS`. Ein Client
   * reicht seine angereicherte Fassung (mit Icon) herein und bekommt sie
   * gefiltert zurück.
   */
  skills?: readonly S[];
}

export interface OfficialCatalog<S extends Skill = Skill> {
  /** Everything below, unsplit and in source order. */
  agents: Agent[];
  skills: S[];
  generalAgents: Agent[];
  lvAgents: Agent[];
  generalSkills: S[];
  lvSkills: S[];
}

export function selectOfficialCatalog<S extends Skill = Skill>(
  input: OfficialCatalogInput<S>
): OfficialCatalog<S> {
  const { locale, instanceId, platform, hiddenAgentIds, hiddenSkillMentions, lvIds } = input;

  const agents = getVisibleSystemAgentsForLocale(locale, instanceId).filter(
    (a) =>
      isAdminVisibleAgent(a.identifier, hiddenAgentIds) &&
      isAgentVisibleForPlatform(a, platform) &&
      isLvItemVisibleForRoles(a.identifier, lvIds)
  );

  // Boundary cast: `SKILLS` is `as const`; the declared interface is what callers read.
  const source = input.skills ?? (SKILLS as readonly Skill[] as readonly S[]);
  const skills = source.filter((s) => {
    const owner = getSystemAgent(s.identifier);
    // Same switch as `agentsList` in @gruenerator/chat: a recipe whose owner is
    // out of the inventory (a disabled Landesverband) is not offered.
    if (owner?.hiddenFromInventory === true) return false;
    if (owner && !isAgentVisibleForPlatform(owner, platform)) return false;
    return (
      matchesRecipeAudience(s.audience, locale) &&
      isAdminVisibleSkill(s.mention, hiddenSkillMentions) &&
      isSkillOfferedIn(s, instanceId) &&
      isLvItemVisibleForRoles(s.identifier, lvIds)
    );
  });

  return {
    agents,
    skills,
    generalAgents: agents.filter((a) => !isLandesverbandIdentifier(a.identifier)),
    lvAgents: agents.filter((a) => isLandesverbandIdentifier(a.identifier)),
    generalSkills: skills.filter((s) => !isLandesverbandIdentifier(s.identifier)),
    lvSkills: skills.filter((s) => isLandesverbandIdentifier(s.identifier)),
  };
}
