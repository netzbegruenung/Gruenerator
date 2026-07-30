/**
 * Which Landesverbände a user belongs to, derived from their profile roles.
 *
 * The role wizard already asks for a Bundesland and stores it in
 * `profile.roles[].bundesland` (`packages/shared/src/roles`). This module turns
 * that into LV ids so the same answer drives every LV-scoped surface:
 * Agentura visibility, the pre-starred recipes in the composer, and the
 * "Dein Landesverband" group in the recipe library.
 *
 * Deliberately derives rather than storing: the LV↔agent↔recipe relationship
 * already lives in `LANDESVERBAENDE` and in the agent `identifier` a recipe
 * carries, so nothing here needs a new field in the skill frontmatter or a
 * per-user row.
 *
 * Like `audience.ts`, this governs DISCOVERY only. `getSystemAgent` and
 * `resolveSkillMention` stay locale- and role-agnostic so shared links and
 * `@`/`/` mentions in existing threads keep resolving for everyone.
 */
import { LANDESVERBAENDE } from './landesverbaende.js';
import { SKILLS } from './skills/index.js';
import { getSystemAgent, VISIBLE_SYSTEM_AGENTS } from './system.js';

/**
 * Structural role shape — mirrors the part of `UserRole` this module reads,
 * without importing across modules. `rolle` is listed so callers can pass a
 * whole role object without tripping excess-property checks; only `bundesland`
 * is actually used.
 */
export interface RoleLandesverbandInput {
  bundesland?: string | undefined;
  rolle?: string | undefined;
}

/** The single Austrian entry; AT roles carry Bundesländer that have no LV of their own. */
const AT_LANDESVERBAND_ID = 'oesterreich';

const LV_ID_BY_TITLE: ReadonlyMap<string, string> = new Map(
  LANDESVERBAENDE.map((lv) => [lv.title, lv.id])
);

/**
 * LV ids that still have at least one discoverable agent. A Landesverband whose
 * notebook is switched off (`enabled: false`) has both its specialist agents
 * marked `hiddenFromInventory` in `system.ts` — the role rule must not resurrect
 * them, so it is intersected with the visible set rather than layered on top.
 */
const DISCOVERABLE_LV_IDS: ReadonlySet<string> = new Set(
  LANDESVERBAENDE.filter((lv) =>
    VISIBLE_SYSTEM_AGENTS.some(
      (agent) => agent.identifier === lv.prAgentId || agent.identifier === lv.buergerAgentId
    )
  ).map((lv) => lv.id)
);

/**
 * The Landesverbände this user is affiliated with, in registry order.
 *
 * German roles map by Bundesland label; Austrian users resolve to the single
 * `oesterreich` entry as soon as they have any role at all, because the AT
 * Bundesländer (Wien, Tirol, …) are not separate Landesverbände.
 * Free-text roles ("Sonstige") carry no Bundesland and never match.
 */
export function landesverbandIdsForRoles(
  roles: readonly RoleLandesverbandInput[],
  userLocale: string
): readonly string[] {
  if (roles.length === 0) return [];

  if (userLocale === 'de-AT') {
    return DISCOVERABLE_LV_IDS.has(AT_LANDESVERBAND_ID) ? [AT_LANDESVERBAND_ID] : [];
  }

  const ids = new Set<string>();
  for (const role of roles) {
    if (!role.bundesland) continue;
    const id = LV_ID_BY_TITLE.get(role.bundesland);
    if (id && DISCOVERABLE_LV_IDS.has(id)) ids.add(id);
  }
  // Registry order, so callers render Landesverbände consistently.
  return LANDESVERBAENDE.filter((lv) => ids.has(lv.id)).map((lv) => lv.id);
}

/**
 * Should this LV-scoped agent or recipe show up in a user's inventory?
 *
 * Non-LV identifiers always pass — callers hand the whole list through this
 * filter rather than pre-splitting it.
 */
export function isLvItemVisibleForRoles(identifier: string, lvIds: readonly string[]): boolean {
  const lv = LANDESVERBAENDE.find(
    (entry) => entry.prAgentId === identifier || entry.buergerAgentId === identifier
  );
  if (!lv) return true;
  return lvIds.includes(lv.id);
}

/**
 * Recipe `mention`s belonging to the user's Landesverbände, lowercased to match
 * the format the favourites store keeps.
 */
export function lvSkillMentionsForRoles(
  roles: readonly RoleLandesverbandInput[],
  userLocale: string
): readonly string[] {
  const lvIds = landesverbandIdsForRoles(roles, userLocale);
  if (lvIds.length === 0) return [];

  // `Set<string>`, not the literal union the registry infers: skill identifiers
  // come from a different (narrower) union, and `has` would reject them.
  const ownedAgentIds = new Set<string>(
    LANDESVERBAENDE.filter((lv) => lvIds.includes(lv.id)).flatMap((lv) => [
      lv.prAgentId,
      lv.buergerAgentId,
    ])
  );

  return SKILLS.filter(
    (skill) =>
      ownedAgentIds.has(skill.identifier) &&
      // A recipe whose owning agent is hidden (disabled notebook) is already
      // dropped from `agentsList`; don't pre-star what nothing will render.
      getSystemAgent(skill.identifier)?.hiddenFromInventory !== true
  ).map((skill) => skill.mention.toLowerCase());
}

/**
 * Should this notebook be offered in a picker?
 *
 * Non-Landesverband notebooks (Grundsatzprogramm, Kommunalwiki, …) always pass —
 * callers hand the whole list through. An LV notebook shows only to members of
 * that Landesverband: the composer's "+" menu listed all of them to everyone,
 * so a Berlin user scrolled past Bayern, MV, Thüringen and the rest to reach
 * the one notebook they actually use.
 *
 * Discovery only. `resolveMentionable` keeps the unfiltered list, so `@bayern`
 * in an existing thread still resolves for anyone.
 */
export function isLvNotebookVisibleForRoles(notebookId: string, lvIds: readonly string[]): boolean {
  const lv = LANDESVERBAENDE.find((entry) => entry.notebookId === notebookId);
  if (!lv) return true;
  return lvIds.includes(lv.id);
}

/** Display title for an LV id, e.g. `'berlin'` → `'Berlin'`. */
export function landesverbandTitle(lvId: string): string | null {
  return LANDESVERBAENDE.find((lv) => lv.id === lvId)?.title ?? null;
}

/**
 * Section headings for the Landesverband part of an inventory. Once the aisle is
 * personal, "Landesverbände" is the wrong word for what is now one specific
 * Landesverband — so both platforms take their wording from here rather than
 * each inventing its own declension.
 */
export function landesverbandHeadings(lvIds: readonly string[]): {
  agents: string;
  skills: string;
} {
  const titles = lvIds.map(landesverbandTitle).filter((t): t is string => t !== null);
  if (titles.length === 1) {
    return { agents: `Grüne ${titles[0]}`, skills: `Rezepte aus ${titles[0]}` };
  }
  if (titles.length > 1) {
    return { agents: 'Deine Landesverbände', skills: 'Rezepte deiner Landesverbände' };
  }
  return { agents: 'Landesverbände', skills: 'Rezepte der Landesverbände' };
}
