/**
 * Which recipes an instance offers — the one seam every discovery surface uses.
 *
 * Three rules, and each exists because the other two cannot express it:
 *
 *   1. **The recipe names its instances** (`Skill.instances`). For content that
 *      exists only somewhere — a Bundesgeschäftsstelle recipe has no meaning on
 *      the general instance. Curating this from the instance side would mean
 *      editing every *other* instance to hide it, and forgetting one leaks.
 *   2. **The instance names what it drops** (`hide.skillCategories` /
 *      `hide.skillMentions`). For shared content a deployment does not want.
 *   3. **The owner cascade.** A recipe whose owning agent this instance hides
 *      goes with it. This is what makes hiding the Landesverband notebooks a
 *      one-liner: none of the ~25 LV recipes is named anywhere, they fall
 *      because their agent fell because its notebook fell.
 *
 * **Discovery-only.** `resolveSkillMention` and `resolveRecipe` stay unfiltered:
 * an old thread, a shared link and an explicitly typed `@mention` must keep
 * resolving (URL-Sonderrecht, CLAUDE.md). What changes is what gets *offered* —
 * pickers, galleries, the library and the catalogue the model may load from.
 */
import {
  getInstance,
  policyCoversSkill,
  type InstanceId,
  type InstancePolicyView,
} from '../instances/index.js';

import { getLvAgentIdsHiddenIn } from './landesverbandHubs.js';

/** The part of a `Skill` visibility depends on. */
export interface SkillInstanceView {
  mention: string;
  identifier: string;
  skillCategory?: string;
  instances?: readonly string[];
}

/**
 * Does this instance offer the recipe? See the module header for the three rules.
 *
 * Both tiers, not just `hide`: `block` is the stronger statement, so anything it
 * covers is also not on offer. Folgenlos, solange keine Instanz `block` für
 * Rezepte setzt — aber ohne die Zeile wäre ein `block: { skillMentions: [...] }`
 * schwächer als ein `hide`, und das fiele erst dem auf, der es einträgt.
 *
 * Das schließt die Entdeckungs-Hälfte von `block`. Die andere Hälfte — ein
 * Direktlink, der 404t — gibt es für Rezepte gar nicht: `resolveSkillMention`
 * ist bewusst ungefiltert, damit ein alter Thread weiter auflöst. Wer `block`
 * für Rezepte wirklich braucht, baut sie dort.
 */
export function isSkillOfferedIn(skill: SkillInstanceView, instanceId: InstanceId): boolean {
  if (skill.instances && !skill.instances.includes(instanceId)) return false;
  if (!skillPolicyOffers(skill, getInstance(instanceId))) return false;
  return !getLvAgentIdsHiddenIn(instanceId).has(skill.identifier);
}

/**
 * Rule 2 alone, against a policy view rather than a registered id — die Form,
 * in der sich beide Stufen prüfen lassen. Die Registry führt heute keine
 * Instanz, die `block` für Rezepte setzt; ohne diese Naht bliebe die Stufe
 * ungeprüft, bis jemand sie einträgt.
 */
export function skillPolicyOffers(skill: SkillInstanceView, view: InstancePolicyView): boolean {
  return !policyCoversSkill(view.hide, skill) && !policyCoversSkill(view.block, skill);
}
