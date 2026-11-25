import { SYSTEM_AGENT_DEFINITIONS } from './definitions/index.generated.js';
import { LV_BUERGER_AGENTS, type LV_BUERGER_SPECS } from './lvBuergerAgents.js';
import { LV_PR_AGENTS, type LV_PR_SPECS } from './lvPrAgents.js';
import { LV_SOURCE_AGENTS, type LvSourceAgentId } from './lvSourceAgents.js';
import { LV_WPS_AGENTS, type LV_WPS_SPECS } from './lvWahlpruefsteinAgents.js';
import { AGENT_ALIASES, DISABLED_LV_AGENT_IDS } from './slim.js';

import type { Agent } from './types.js';

// The agent definitions live in two shapes:
//   definitions/*.md  — hand-written agents (universal, antrag, suche, the PR
//                       agents, personas & specialized writers). One markdown
//                       file per agent: frontmatter metadata + systemRole body,
//                       compiled to definitions/index.generated.ts by
//                       scripts/build-agents.ts. Edit the *.md, re-run
//                       `pnpm --filter @gruenerator/shared build:agents`.
//   lvPrAgents.ts     — generated per-LV "Öffentlichkeitsarbeit" agents (one
//                       template fans out to N LVs, so they stay builders).
//   lvBuergerAgents.ts — generated per-LV "Bürger*innenanfragen" agents.
//   lvWahlpruefsteinAgents.ts — generated per-LV "Wahlprüfsteine" agents.
//   lvSourceAgents.ts — generated per-LV "Beschlüsse"/"Wahlprogramm" agents,
//                       only where the LV indexes that content type.
// This file only assembles them into the registry and resolves identifiers.
const RAW_SYSTEM_AGENTS: readonly Agent[] = [
  ...SYSTEM_AGENT_DEFINITIONS,
  ...LV_PR_AGENTS,
  ...LV_BUERGER_AGENTS,
  ...LV_WPS_AGENTS,
  ...LV_SOURCE_AGENTS,
];

// The set of Landesverband agents hidden by a disabled notebook is computed in
// `slim.ts` (the boot-time registry shares it), see there for the rationale.
export { DISABLED_LV_AGENT_IDS };
const disabledLvAgentIds = DISABLED_LV_AGENT_IDS;

// Identifiers stay live (legacy threads + backend fallbacks keep resolving via
// `getSystemAgent`); only `hiddenFromInventory` flips so no UI surface offers them.
export const SYSTEM_AGENTS: readonly Agent[] = RAW_SYSTEM_AGENTS.map((agent) =>
  disabledLvAgentIds.has(agent.identifier) ? { ...agent, hiddenFromInventory: true } : agent
);

/** SYSTEM_AGENTS minus those marked `hiddenFromInventory` — shared between
 *  every agent-inventory render (sidebar modal, /agents page). */
export const VISIBLE_SYSTEM_AGENTS: readonly Agent[] = SYSTEM_AGENTS.filter(
  (a) => !a.hiddenFromInventory
);

type BaseSystemAgentId = (typeof SYSTEM_AGENT_DEFINITIONS)[number]['identifier'];
type LvPrAgentId = `gruenerator-oeffentlichkeitsarbeit-${(typeof LV_PR_SPECS)[number]['lv']}`;
type LvBuergerAgentId = `gruenerator-buergeranfragen-${(typeof LV_BUERGER_SPECS)[number]['lv']}`;
type LvWpsAgentId = `gruenerator-wahlpruefsteine-${(typeof LV_WPS_SPECS)[number]['lv']}`;
export type SystemAgentId =
  BaseSystemAgentId | LvPrAgentId | LvBuergerAgentId | LvWpsAgentId | LvSourceAgentId;

export const DEFAULT_SYSTEM_AGENT_ID = 'gruenerator-universal' satisfies SystemAgentId;

const systemAgentMap = new Map<string, Agent>(
  SYSTEM_AGENTS.map((agent) => [agent.identifier, agent])
);

export function getSystemAgent(identifier: string): Agent | undefined {
  const canonical = AGENT_ALIASES[identifier] ?? identifier;
  return systemAgentMap.get(canonical);
}
