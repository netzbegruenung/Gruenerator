import {
  agentKey,
  getSystemAgent,
  isLandesverbandIdentifier,
  landesverbandRegion,
  resolveAgentSlug,
  type Agent,
} from '../agents/index.js';

import { type ForeignAgent } from './userAgents.js';

export interface AgentLookupResult {
  /** Without `systemRole` for someone else's agent — the prompt is the owner's. */
  agent: ForeignAgent | null;
  /** Created by a user (own or someone else's), not from the registry. */
  isUserAgent: boolean;
  /** The caller's own agent — only then may they edit or share it. */
  isOwn: boolean;
}

/**
 * Resolve an Agentura agent-detail slug — an `agentRef` — to its agent: the
 * system registry (slug → identifier via `resolveAgentSlug`), then the caller's
 * own agents, then someone else's shared or public agent by its row uuid. A
 * bare identifier of someone else's agent still resolves for old links, but
 * only if the caller has no agent of that name.
 */
export function resolveAgentBySlug(
  slug: string,
  lists: {
    own: readonly Agent[];
    shared: readonly ForeignAgent[];
    public: readonly ForeignAgent[];
  }
): AgentLookupResult {
  const decoded = decodeURIComponent(slug);
  const identifier = resolveAgentSlug(decoded) ?? decoded;

  const systemAgent = getSystemAgent(identifier);
  if (systemAgent) return { agent: systemAgent, isUserAgent: false, isOwn: false };

  const mine = lists.own.find((a) => a.id === decoded || a.identifier === identifier);
  if (mine) return { agent: mine, isUserAgent: true, isOwn: true };

  const foreign = [...lists.shared, ...lists.public];
  const other =
    foreign.find((a) => a.id === decoded) ?? foreign.find((a) => a.identifier === identifier);
  return other
    ? { agent: other, isUserAgent: true, isOwn: false }
    : { agent: null, isUserAgent: false, isOwn: false };
}

/** Agents sharing a tag (or the same LV region) with the given one, self excluded. */
export function relatedAgents<T extends ForeignAgent>(
  agent: ForeignAgent,
  pool: readonly T[],
  limit = 6
): T[] {
  const tags = new Set(agent.tags.map((t) => t.toLowerCase()));
  const region = isLandesverbandIdentifier(agent.identifier)
    ? landesverbandRegion(agent.identifier)
    : null;

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
