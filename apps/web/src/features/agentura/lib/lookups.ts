import { agentsList, type AgentListItem } from '@gruenerator/chat';
import {
  isLandesverbandIdentifier,
  landesverbandLabel,
  landesverbandRegion,
} from '@gruenerator/shared/agents';
import { resolveAgentBySlug, type AgentLookupResult } from '@gruenerator/shared/grueneratoren';

import { usePublicUserAgents, useSharedUserAgents, useUserAgents } from '../../agents/api';

// The three LV identifier helpers moved to `@gruenerator/shared/agents` when
// mobile grew its own Agentura — they are pure string work on identifiers, so
// there was no reason for web to own the only copy.
export { isLandesverbandIdentifier, landesverbandLabel, landesverbandRegion };
export { relatedAgents } from '@gruenerator/shared/grueneratoren';

export interface AgentLookup extends AgentLookupResult {
  isLoading: boolean;
}

/** Resolve an Agentura agent-detail `:slug` — see {@link resolveAgentBySlug}. */
export function useAgentBySlug(slug: string | undefined): AgentLookup {
  const own = useUserAgents();
  const shared = useSharedUserAgents();
  const pub = usePublicUserAgents();
  // A teammate's agent comes from the shared or public list, so a deep link
  // is only "not found" once all three have answered.
  const isLoading = own.isLoading || shared.isLoading || pub.isLoading;
  if (!slug) return { agent: null, isUserAgent: false, isOwn: false, isLoading };
  return {
    ...resolveAgentBySlug(slug, {
      own: own.data ?? [],
      shared: (shared.data ?? []).map((e) => e.agent),
      public: pub.data ?? [],
    }),
    isLoading,
  };
}

/** Find a skill (with resolved icon) by its `mention`. */
export function findSkillByMention(mention: string | undefined): AgentListItem | null {
  if (!mention) return null;
  const decoded = decodeURIComponent(mention).toLowerCase();
  return agentsList.find((s) => s.mention.toLowerCase() === decoded) ?? null;
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
