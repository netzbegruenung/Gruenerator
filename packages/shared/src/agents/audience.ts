import { SYSTEM_AGENTS, VISIBLE_SYSTEM_AGENTS } from './system.js';

import type { Agent } from './types.js';

/**
 * Should the user with `userLocale` see this agent in the inventory / sidebar?
 *
 * - `audience: 'all'` or `undefined` → always visible (default).
 * - `audience: 'de-DE'` → only visible to German-locale users.
 * - `audience: 'de-AT'` → only visible to Austrian-locale users.
 *
 * Backend resolution by identifier is unaffected — this only governs which
 * agents the user discovers through the UI. Direct URL/legacy thread access
 * still resolves any registry agent.
 */
export function isAgentVisibleForLocale(agent: Agent, userLocale: string): boolean {
  if (agent.audience === undefined || agent.audience === 'all') return true;
  return agent.audience === userLocale;
}

/**
 * Apply `agent.localized[userLocale]` overrides on top of the agent's
 * defaults, returning a new Agent. Cheap shallow merge — pass-through if
 * no localized bundle matches the locale.
 */
export function localizeAgent(agent: Agent, userLocale: string): Agent {
  const overrides = agent.localized?.[userLocale === 'de-AT' ? 'de-AT' : 'de-DE'];
  if (!overrides) return agent;
  return { ...agent, ...overrides };
}

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
 * Convenience: the public, locale-filtered, localized inventory list.
 * The right starting point for sidebar / picker UIs that want a clean
 * per-user-locale view of available agents.
 */
export function getVisibleSystemAgentsForLocale(userLocale: string): readonly Agent[] {
  return VISIBLE_SYSTEM_AGENTS.filter((a) => isAgentVisibleForLocale(a, userLocale)).map((a) =>
    localizeAgent(a, userLocale)
  );
}
