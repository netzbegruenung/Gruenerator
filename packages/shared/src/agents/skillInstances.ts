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
import { getInstance, policyCoversSkill, type InstanceId } from '../instances/index.js';

import { getLvAgentIdsHiddenIn } from './landesverbandHubs.js';

/** The part of a `Skill` visibility depends on. */
export interface SkillInstanceView {
  mention: string;
  identifier: string;
  skillCategory?: string;
  instances?: readonly string[];
}

/** Does this instance offer the recipe? See the module header for the three rules. */
export function isSkillOfferedIn(skill: SkillInstanceView, instanceId: InstanceId): boolean {
  if (skill.instances && !skill.instances.includes(instanceId)) return false;
  if (policyCoversSkill(getInstance(instanceId).hide, skill)) return false;
  return !getLvAgentIdsHiddenIn(instanceId).has(skill.identifier);
}
