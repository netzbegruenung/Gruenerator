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
import { getUserAgent as getUserAgentRow } from '../../../services/userAgents/userAgentsRepository.js';
import { createLogger } from '../../../utils/logger.js';

import type { AgentConfig } from './types.js';

const log = createLogger('AgentLoader');

const sortedAgents: AgentConfig[] = [...SYSTEM_AGENTS]
  .map((agent) => agent as Agent as AgentConfig)
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
  return agent ? (agent as AgentConfig) : undefined;
}

export function getDefaultAgentId(): string {
  return DEFAULT_SYSTEM_AGENT_ID;
}

export function clearAgentsCache(): void {
  // No-op: registry is now a static import. Kept for backward-compatible call sites.
}

/**
 * Resolves an agent for a user: system registry → user-created agents
 * (`user_agents` table). Returns undefined if neither matches; legacy
 * `custom_prompts` fallback lives in `getAgentOrCustomPrompt` below.
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
    if (userAgent) return userAgent as AgentConfig;
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
