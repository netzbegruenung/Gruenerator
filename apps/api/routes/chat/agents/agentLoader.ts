/**
 * Agent Configuration Loader
 *
 * System agents come from the @gruenerator/shared/agents registry (typed TS, single
 * source of truth shared with the web frontend). Custom user prompts fall back through
 * `getAgentOrCustomPrompt`.
 */

import {
  SYSTEM_AGENTS,
  DEFAULT_SYSTEM_AGENT_ID,
  getSystemAgent,
  type Agent,
} from '@gruenerator/shared/agents';

import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import { getInternalAgentPrompt } from '../../../services/skills/internalPrompts.js';
import {
  getGroupSharedUserAgent,
  getUserAgent as getUserAgentRow,
} from '../../../services/userAgents/userAgentsRepository.js';
import { createLogger } from '../../../utils/logger.js';

import { getPipelineSystemRole } from './pipelines/index.js';

import type { AgentConfig } from './types.js';

const log = createLogger('AgentLoader');

const missingRoleLogged = new Set<string>();

/**
 * Fills in the party-internal `systemRole`, which the shared registry ships
 * empty on purpose — it is bundled into web and mobile, so a persona there
 * would be public. This is the single seam where a system agent becomes an
 * `AgentConfig`, so every downstream reader sees a complete agent.
 *
 * Drei Fälle:
 *   - Ein Pipeline-Agent (`agents/pipelines/`) bringt seine Persona im Repo mit,
 *     wenn sie reines Handwerk ist. Sie steht in `apps/api` und damit weder im
 *     Web- noch im Mobile-Bundle — das ist der Unterschied, auf den es ankommt,
 *     nicht „öffentlich vs. privat". Ein solcher Agent kann den Rollout gar
 *     nicht verfehlen; am 13.08.2026 lief Einfache Sprache zwei Stunden mit der
 *     generischen Ersatzrolle, weil Salt noch nicht durch war.
 *   - Every agent with an empty systemRole — markdown-defined agents AND the
 *     generated LV agents (lvPrAgents/lvBuergerAgents/lvWahlpruefsteinAgents) —
 *     gets it from `<INTERN_CONTENT_DIR>/agents/<identifier>.md`.
 *   - Nothing on disk means the rollout did not land. Unlike a recipe, an agent
 *     has nothing to fall back *to*, and an empty role makes
 *     `promptAssemblyGraph.buildSystemText` throw — so substitute a generic
 *     role and log once per agent. A blander answer beats a 500, but this is a
 *     misconfiguration and the log has to say so.
 */
function withInternalRole(agent: Agent): AgentConfig {
  if (agent.systemRole) return agent as AgentConfig;

  const fromPipeline = getPipelineSystemRole(agent.identifier);
  if (fromPipeline) return { ...agent, systemRole: fromPipeline } as AgentConfig;

  const internal = getInternalAgentPrompt(agent.identifier);
  if (internal) return { ...agent, systemRole: internal } as AgentConfig;

  if (!missingRoleLogged.has(agent.identifier)) {
    missingRoleLogged.add(agent.identifier);
    log.error(
      `No internal systemRole for "${agent.identifier}" — falling back to a generic ` +
        `persona. Check INTERN_CONTENT_DIR and the Salt rollout.`
    );
  }
  return {
    ...agent,
    systemRole: `Du bist ${agent.title}, ein Assistent für BÜNDNIS 90/DIE GRÜNEN.`,
  } as AgentConfig;
}

const sortedAgents: AgentConfig[] = [...SYSTEM_AGENTS]
  .map((agent) => withInternalRole(agent as Agent))
  .sort((a, b) => {
    if (a.identifier === DEFAULT_SYSTEM_AGENT_ID) return -1;
    if (b.identifier === DEFAULT_SYSTEM_AGENT_ID) return 1;
    return a.title.localeCompare(b.title, 'de');
  });

export async function loadAgents(): Promise<AgentConfig[]> {
  return sortedAgents;
}

export async function getAgent(identifier: string): Promise<AgentConfig | undefined> {
  const agent = getSystemAgent(identifier);
  return agent ? withInternalRole(agent as Agent) : undefined;
}

export function getDefaultAgentId(): string {
  return DEFAULT_SYSTEM_AGENT_ID;
}

export function clearAgentsCache(): void {
  // No-op: registry is now a static import. Kept for backward-compatible call sites.
}

/**
 * Resolves an agent for a user: system registry → user-created agents
 * (`user_agents` table, owner-scoped) → agents shared into a group the user is
 * an active member of. Returns undefined if none match; legacy `custom_prompts`
 * fallback lives in `getAgentOrCustomPrompt` below.
 *
 * Converted custom generators are plain `user_agents` rows (identifier
 * `cg-<slug>`), so they resolve through the same path as any other user agent.
 */
export async function getAgentForUser(
  identifier: string,
  userId: string
): Promise<AgentConfig | undefined> {
  const builtIn = await getAgent(identifier);
  if (builtIn) return builtIn;

  try {
    const userAgent = await getUserAgentRow(userId, identifier);
    if (userAgent) return { ...userAgent, isUserAgent: true } as AgentConfig;

    // Not the owner — fall back to an agent shared into one of the user's
    // groups (dedicated agent-share flow, keyed by the agent's UUID).
    const sharedAgent = await getGroupSharedUserAgent(identifier, userId);
    if (sharedAgent) return { ...sharedAgent, isUserAgent: true } as AgentConfig;
  } catch (error) {
    log.error('[AgentLoader] Error looking up user agent:', error);
  }
  return undefined;
}

/**
 * Resolves an agent by identifier, falling back to user's custom prompts if not found
 * in the built-in registry or user-agents table. This allows custom prompts to be
 * used as agents in the chat via @mention.
 */
export async function getAgentOrCustomPrompt(
  identifier: string,
  userId: string
): Promise<AgentConfig | undefined> {
  const merged = await getAgentForUser(identifier, userId);
  if (merged) return merged;

  try {
    const postgres = getPostgresInstance();
    const results = await postgres.query(
      `SELECT cp.id, cp.name, cp.prompt, cp.slug
       FROM custom_prompts cp
       LEFT JOIN saved_prompts sp ON sp.prompt_id = cp.id AND sp.user_id = $2
       WHERE cp.id::text = $1 AND cp.is_active = true
         AND (cp.user_id = $2 OR cp.is_public = true OR sp.id IS NOT NULL)
       LIMIT 1`,
      [identifier, userId],
      { table: 'custom_prompts' }
    );

    if (!results || results.length === 0) return undefined;

    const customPrompt = results[0] as { id: string; name: string; prompt: string; slug: string };
    const defaultAgent = await getAgent(DEFAULT_SYSTEM_AGENT_ID);
    if (!defaultAgent) return undefined;

    log.info(
      `[AgentLoader] Resolved custom prompt "${customPrompt.name}" (${customPrompt.id}) as agent`
    );

    return {
      ...defaultAgent,
      identifier: customPrompt.id,
      title: customPrompt.name,
      systemRole: customPrompt.prompt,
    };
  } catch (error) {
    log.error('[AgentLoader] Error looking up custom prompt:', error);
    return undefined;
  }
}
