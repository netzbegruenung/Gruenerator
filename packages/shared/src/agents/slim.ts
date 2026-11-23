import { DEFAULT_INSTANCE_ID, type InstanceId } from '../instances/index.js';
import { getDisabledNotebookIds } from '../notebooks/index.js';

import { isAgentVisibleForLocale, substitutePartyName } from './audience.js';
import { AGENT_SLIMS } from './definitions/slim.generated.js';
import { LV_HUBS, getLvAgentIdsHiddenIn } from './landesverbandHubs.js';
import { SKILL_SLIMS } from './skills/slim.generated.js';

import type { AgentSlim } from './types.js';

// The boot-time registry. Web boot (sidebar, role shortcuts, composer routing,
// favourites) reads agents and recipes through this file instead of
// `system.ts` / `skills/index.ts`: the generated slim index carries only the
// fields the app shell uses, so the entry chunk does not ship the opening copy,
// few-shot examples and tool config of ~100 agents. Anything that needs a field
// outside `AgentSlim` / `SkillSlim` reads the full catalogue. Mirrors the
// resolution rules of `system.ts` (aliases, disabled-LV hiding); `slim.vitest.ts`
// holds the two catalogues together.

export { SKILL_SLIMS };

/** Retired identifiers that still resolve; shared with `system.ts`. */
export const AGENT_ALIASES: Readonly<Record<string, string>> = {
  'gruenerator-kommunal': 'gruenerator-antrag',
};

// A Landesverband's specialist agents (PR, Bürger*innenanfragen, Wahlprüfsteine,
// and where present Beschlussanträge and Wahlprogramm)
// are owned by its hub, which pins the LV notebook. When that notebook is turned
// off (`enabled: false`), hide all of them from discovery — same single switch, no
// per-agent flag. LV_HUBS (itself derived from the LV registry) is the
// authoritative notebook→agents map, so we resolve the agent ids from it.
// Exported for consumers that must distinguish "LV switched off" from the
// static `hiddenFromInventory` on editor/default agents: the recipe catalogue
// keeps a hidden-but-active agent's recipes (gruenerator-universal owns
// `wahlpruefstein`/`aktion`) while dropping a disabled Landesverband's.
export const DISABLED_LV_AGENT_IDS: ReadonlySet<string> = new Set<string>(
  LV_HUBS.filter((hub) => getDisabledNotebookIds().has(hub.notebookId)).flatMap(
    (hub) => hub.agentIds
  )
);

export const SLIM_AGENTS: readonly AgentSlim[] = AGENT_SLIMS.map((agent) =>
  DISABLED_LV_AGENT_IDS.has(agent.identifier) ? { ...agent, hiddenFromInventory: true } : agent
);

export const VISIBLE_SLIM_AGENTS: readonly AgentSlim[] = SLIM_AGENTS.filter(
  (a) => !a.hiddenFromInventory
);

const slimAgentMap = new Map<string, AgentSlim>(SLIM_AGENTS.map((a) => [a.identifier, a]));

/** `getSystemAgent` for callers that only need the boot-time fields. */
export function getSlimAgent(identifier: string): AgentSlim | undefined {
  return slimAgentMap.get(AGENT_ALIASES[identifier] ?? identifier);
}

/** `localizeAgent` for the one user-visible field a slim agent carries. */
export function localizeSlimAgent(agent: AgentSlim, userLocale: string): AgentSlim {
  const locale: 'de-DE' | 'de-AT' = userLocale === 'de-AT' ? 'de-AT' : 'de-DE';
  const title = agent.localized?.[locale]?.title ?? agent.title;
  return { ...agent, title: substitutePartyName(title, locale) };
}

/** `getVisibleSystemAgentsForLocale` for callers that only need the boot-time fields. */
export function getVisibleSlimAgentsForLocale(
  userLocale: string,
  instanceId: InstanceId = DEFAULT_INSTANCE_ID
): readonly AgentSlim[] {
  const hiddenLvAgents = getLvAgentIdsHiddenIn(instanceId);
  return VISIBLE_SLIM_AGENTS.filter(
    (a) => !hiddenLvAgents.has(a.identifier) && isAgentVisibleForLocale(a, userLocale)
  ).map((a) => localizeSlimAgent(a, userLocale));
}
