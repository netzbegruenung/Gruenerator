import { CORE_AGENTS } from './coreAgents.js';
import { LV_BUERGER_AGENTS, type LV_BUERGER_SPECS } from './lvBuergerAgents.js';
import { LV_PR_AGENTS, type LV_PR_SPECS } from './lvPrAgents.js';
import { OEFFENTLICHKEITSARBEIT_AGENTS } from './oeffentlichkeitsarbeitAgents.js';
import { PERSONA_AGENTS } from './personaAgents.js';

import type { Agent } from './types.js';

// The agent definitions are grouped by purpose into sibling files:
//   coreAgents.ts                   — universal, antrag, suche
//   oeffentlichkeitsarbeitAgents.ts — general PR agent + hand-tuned per-LV PR agents
//   personaAgents.ts                — personas & specialized writers
//   lvPrAgents.ts                   — generated per-LV "Öffentlichkeitsarbeit" agents
//   lvBuergerAgents.ts              — generated per-LV "Bürger*innenanfragen" agents
// This file only assembles them into the registry and resolves identifiers.
export const SYSTEM_AGENTS: readonly Agent[] = [
  ...CORE_AGENTS,
  ...OEFFENTLICHKEITSARBEIT_AGENTS,
  ...PERSONA_AGENTS,
  ...LV_PR_AGENTS,
  ...LV_BUERGER_AGENTS,
];

/** SYSTEM_AGENTS minus those marked `hiddenFromInventory` — shared between
 *  every agent-inventory render (sidebar modal, /agents page). */
export const VISIBLE_SYSTEM_AGENTS: readonly Agent[] = SYSTEM_AGENTS.filter(
  (a) => !a.hiddenFromInventory
);

type BaseSystemAgentId =
  | (typeof CORE_AGENTS)[number]['identifier']
  | (typeof OEFFENTLICHKEITSARBEIT_AGENTS)[number]['identifier']
  | (typeof PERSONA_AGENTS)[number]['identifier'];
type LvPrAgentId = `gruenerator-oeffentlichkeitsarbeit-${(typeof LV_PR_SPECS)[number]['lv']}`;
type LvBuergerAgentId = `gruenerator-buergeranfragen-${(typeof LV_BUERGER_SPECS)[number]['lv']}`;
export type SystemAgentId = BaseSystemAgentId | LvPrAgentId | LvBuergerAgentId;

export const DEFAULT_SYSTEM_AGENT_ID = 'gruenerator-universal' satisfies SystemAgentId;

const systemAgentMap = new Map<string, Agent>(
  SYSTEM_AGENTS.map((agent) => [agent.identifier, agent])
);

const SYSTEM_AGENT_ALIASES: Record<string, SystemAgentId> = {
  'gruenerator-kommunal': 'gruenerator-antrag',
};

export function getSystemAgent(identifier: string): Agent | undefined {
  const canonical = SYSTEM_AGENT_ALIASES[identifier] ?? identifier;
  return systemAgentMap.get(canonical);
}
