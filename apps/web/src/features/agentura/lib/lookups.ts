import { agentsList, type AgentListItem } from '@gruenerator/chat';
import {
  getSystemAgent,
  isLandesverbandIdentifier,
  landesverbandLabel,
  landesverbandRegion,
  resolveAgentSlug,
  type Agent,
} from '@gruenerator/shared/agents';

import { useUserAgents } from '../../agents/api';

// The three LV identifier helpers moved to `@gruenerator/shared/agents` when
// mobile grew its own Agentura — they are pure string work on identifiers, so
// there was no reason for web to own the only copy.
export { isLandesverbandIdentifier, landesverbandLabel, landesverbandRegion };

export interface AgentLookup {
  agent: Agent | null;
  isUserAgent: boolean;
  isLoading: boolean;
}

/**
 * Resolve an Agentura agent-detail `:slug` to its agent. Checks the system
 * registry first (slug → identifier via {@link resolveAgentSlug}), then falls
 * back to the signed-in user's own agents.
 */
export function useAgentBySlug(slug: string | undefined): AgentLookup {
  const { data: userAgents = [], isLoading } = useUserAgents();
  if (!slug) return { agent: null, isUserAgent: false, isLoading };

  const decoded = decodeURIComponent(slug);
  const identifier = resolveAgentSlug(decoded) ?? decoded;

  const systemAgent = getSystemAgent(identifier);
  if (systemAgent) return { agent: systemAgent, isUserAgent: false, isLoading };

  const userAgent = userAgents.find((a) => a.identifier === identifier) ?? null;
  return { agent: userAgent, isUserAgent: Boolean(userAgent), isLoading };
}

/** Find a skill (with resolved icon) by its `mention`. */
export function findSkillByMention(mention: string | undefined): AgentListItem | null {
  if (!mention) return null;
  const decoded = decodeURIComponent(mention).toLowerCase();
  return agentsList.find((s) => s.mention.toLowerCase() === decoded) ?? null;
}

/** Agents sharing a tag (or the same LV region) with the given one, self excluded. */
export function relatedAgents(agent: Agent, pool: Agent[], limit = 6): Agent[] {
  const tags = new Set(agent.tags.map((t) => t.toLowerCase()));
  const isLv = isLandesverbandIdentifier(agent.identifier);
  const region = isLv ? landesverbandRegion(agent.identifier) : null;

  return pool
    .filter((other) => other.identifier !== agent.identifier)
    .map((other) => {
      let score = other.tags.reduce((acc, t) => acc + (tags.has(t.toLowerCase()) ? 1 : 0), 0);
      if (region && landesverbandRegion(other.identifier) === region) score += 2;
      return { other, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.other);
}

/** Skills in the same category, self excluded. */
export function relatedSkills(
  skill: AgentListItem,
  pool: AgentListItem[],
  limit = 6
): AgentListItem[] {
  return pool
    .filter(
      (other) => other.mention !== skill.mention && other.skillCategory === skill.skillCategory
    )
    .slice(0, limit);
}
