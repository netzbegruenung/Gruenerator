import { SYSTEM_AGENTS, VISIBLE_SYSTEM_AGENTS } from './system.js';

import type { Agent } from './types.js';

/**
 * Locale-aware party name for `{{partyName}}` placeholders in user-visible
 * agent fields. Mirrors `PARTY_NAMES` in `apps/api/services/localization/`
 * so the frontend renders the same brand string the backend uses in
 * compiled system prompts.
 */
const PARTY_NAMES_BY_LOCALE: Record<'de-DE' | 'de-AT', string> = {
  'de-DE': 'Bündnis 90/Die Grünen',
  'de-AT': 'Die Grünen – Die Grüne Alternative',
};

function substitutePartyName(text: string, locale: 'de-DE' | 'de-AT'): string {
  return text.replace(/\{\{partyName\}\}/g, PARTY_NAMES_BY_LOCALE[locale]);
}

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
 * defaults, then substitute `{{partyName}}` placeholders in user-visible
 * fields with the locale-appropriate party brand. The second pass fixes
 * a latent issue where AT users saw "{{partyName}}" rendered literally
 * in openingMessage / welcomeQuestion / openingQuestions — those strings
 * never went through the backend's LocalizationService.
 */
export function localizeAgent(agent: Agent, userLocale: string): Agent {
  const locale: 'de-DE' | 'de-AT' = userLocale === 'de-AT' ? 'de-AT' : 'de-DE';
  const overrides = agent.localized?.[locale];

  // Step 1: apply explicit overrides (per-agent custom AT/DE copy).
  const merged = overrides ? { ...agent, ...overrides } : agent;

  // Step 2: substitute `{{partyName}}` in the user-visible fields so AT
  // users see "Die Grünen – Die Grüne Alternative" and DE users see
  // "Bündnis 90/Die Grünen" without each agent author having to remember.
  return {
    ...merged,
    title: substitutePartyName(merged.title, locale),
    description: substitutePartyName(merged.description, locale),
    openingMessage: substitutePartyName(merged.openingMessage, locale),
    ...(merged.welcomeQuestion != null && {
      welcomeQuestion: substitutePartyName(merged.welcomeQuestion, locale),
    }),
    openingQuestions: merged.openingQuestions.map((q) => substitutePartyName(q, locale)),
  };
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
