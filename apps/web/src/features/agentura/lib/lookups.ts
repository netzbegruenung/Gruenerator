import { agentsList, type AgentListItem } from '@gruenerator/chat';
import { getSystemAgent, resolveAgentSlug, type Agent } from '@gruenerator/shared/agents';

import { useUserAgents } from '../../agents/api';

/** Per-Landesverband agents and skills share this identifier prefix family. */
export function isLandesverbandIdentifier(identifier: string): boolean {
  return (
    identifier.startsWith('gruenerator-oeffentlichkeitsarbeit-') ||
    identifier.startsWith('gruenerator-buergeranfragen-')
  );
}

/** The Landesverband slug from an LV identifier (e.g. `…-berlin` → `berlin`). */
export function landesverbandRegion(identifier: string): string {
  return identifier.replace(/^gruenerator-(oeffentlichkeitsarbeit|buergeranfragen)-/, '');
}

/** Title-case an LV region slug for display (`berlin` → `Berlin`). */
export function landesverbandLabel(identifier: string): string {
  return landesverbandRegion(identifier)
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

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
      (other) =>
        other.mention !== skill.mention &&
        other.skillCategory === skill.skillCategory &&
        Boolean(other.skillSystemPrompt)
    )
    .slice(0, limit);
}
