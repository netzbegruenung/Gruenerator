import { getDisabledNotebookIds } from '../notebooks/index.js';

import { CORE_AGENTS } from './coreAgents.js';
import { LV_HUBS } from './landesverbandHubs.js';
import { LV_BUERGER_AGENTS, type LV_BUERGER_SPECS } from './lvBuergerAgents.js';
import { LV_PR_AGENTS, type LV_PR_SPECS } from './lvPrAgents.js';
import {
  OEFFENTLICHKEITSARBEIT_AGENTS,
  type OeffentlichkeitsarbeitAgentId,
} from './oeffentlichkeitsarbeitAgents.js';
import { PERSONA_AGENTS } from './personaAgents.js';

import type { Agent } from './types.js';

// The agent definitions are grouped by purpose into sibling files:
//   coreAgents.ts                   — universal, antrag, suche
//   oeffentlichkeitsarbeitAgents.ts — general PR agent + hand-tuned per-LV PR agents
//   personaAgents.ts                — personas & specialized writers
//   lvPrAgents.ts                   — generated per-LV "Öffentlichkeitsarbeit" agents
//   lvBuergerAgents.ts              — generated per-LV "Bürger*innenanfragen" agents
// This file only assembles them into the registry and resolves identifiers.
const RAW_SYSTEM_AGENTS: readonly Agent[] = [
  ...CORE_AGENTS,
  ...OEFFENTLICHKEITSARBEIT_AGENTS,
  ...PERSONA_AGENTS,
  ...LV_PR_AGENTS,
  ...LV_BUERGER_AGENTS,
];

// A Landesverband's two specialist agents (PR + Bürger*innenanfragen) are owned by
// its hub, which pins the LV notebook. When that notebook is turned off
// (`enabled: false`), hide both agents from discovery — same single switch, no
// per-agent flag. LV_HUBS (itself derived from the LV registry) is the
// authoritative notebook→agents map, so we resolve both agent ids from it.
const disabledLvAgentIds = new Set<string>(
  LV_HUBS.filter((hub) => getDisabledNotebookIds().has(hub.notebookId)).flatMap((hub) => [
    hub.prAgentId,
    hub.buergerAgentId,
  ])
);

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

type BaseSystemAgentId =
  | (typeof CORE_AGENTS)[number]['identifier']
  | OeffentlichkeitsarbeitAgentId
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
