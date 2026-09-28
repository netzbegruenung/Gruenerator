import { agentsList, type AgentListItem } from '@gruenerator/chat';
import {
  agentKey,
  getSystemAgent,
  isLandesverbandIdentifier,
  landesverbandLabel,
  landesverbandRegion,
  resolveAgentSlug,
} from '@gruenerator/shared/agents';

import {
  usePublicUserAgents,
  useSharedUserAgents,
  useUserAgents,
  type ForeignAgent,
} from '../../agents/api';

// The three LV identifier helpers moved to `@gruenerator/shared/agents` when
// mobile grew its own Agentura — they are pure string work on identifiers, so
// there was no reason for web to own the only copy.
export { isLandesverbandIdentifier, landesverbandLabel, landesverbandRegion };

export interface AgentLookup {
  /** Without `systemRole` for someone else's agent — the prompt is the owner's. */
  agent: ForeignAgent | null;
  /** Created by a user (own or someone else's), not from the registry. */
  isUserAgent: boolean;
  /** The caller's own agent — only then may they edit or share it. */
  isOwn: boolean;
  isLoading: boolean;
}

/**
 * Resolve an Agentura agent-detail `:slug` — an `agentRef` — to its agent:
 * the system registry (slug → identifier via {@link resolveAgentSlug}), then
 * the caller's own agents, then someone else's shared or public agent by its
 * row uuid. A bare identifier of someone else's agent still resolves for old
 * links, but only if the caller has no agent of that name.
 */
export function useAgentBySlug(slug: string | undefined): AgentLookup {
  const own = useUserAgents();
  const shared = useSharedUserAgents();
  const pub = usePublicUserAgents();
  const userAgents = own.data ?? [];
  const sharedAgents = shared.data ?? [];
  const publicAgents = pub.data ?? [];
  // A teammate's agent comes from the shared or public list, so a deep link
  // is only "not found" once all three have answered.
  const isLoading = own.isLoading || shared.isLoading || pub.isLoading;
  const none = { agent: null, isUserAgent: false, isOwn: false, isLoading };
  if (!slug) return none;

  const decoded = decodeURIComponent(slug);
  const identifier = resolveAgentSlug(decoded) ?? decoded;

  const systemAgent = getSystemAgent(identifier);
  if (systemAgent) return { agent: systemAgent, isUserAgent: false, isOwn: false, isLoading };

  const mine = userAgents.find((a) => a.id === decoded || a.identifier === identifier);
  if (mine) return { agent: mine, isUserAgent: true, isOwn: true, isLoading };

  const foreign = [...sharedAgents.map((e) => e.agent), ...publicAgents];
  const other =
    foreign.find((a) => a.id === decoded) ?? foreign.find((a) => a.identifier === identifier);
  return other ? { agent: other, isUserAgent: true, isOwn: false, isLoading } : none;
}

/** Find a skill (with resolved icon) by its `mention`. */
export function findSkillByMention(mention: string | undefined): AgentListItem | null {
  if (!mention) return null;
  const decoded = decodeURIComponent(mention).toLowerCase();
  return agentsList.find((s) => s.mention.toLowerCase() === decoded) ?? null;
}

/** Agents sharing a tag (or the same LV region) with the given one, self excluded. */
export function relatedAgents<T extends ForeignAgent>(
  agent: ForeignAgent,
  pool: T[],
  limit = 6
): T[] {
  const tags = new Set(agent.tags.map((t) => t.toLowerCase()));
  const isLv = isLandesverbandIdentifier(agent.identifier);
  const region = isLv ? landesverbandRegion(agent.identifier) : null;

  return pool
    .filter((other) => agentKey(other) !== agentKey(agent))
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
