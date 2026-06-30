import { getVisibleSystemAgentsForLocale, type Agent } from '@gruenerator/shared/agents';
import { useMemo } from 'react';

import { useSharedUserAgents, useUserAgents } from '../../agents/api';

import { useAuthStore } from '@/stores/authStore';

/** A delegatable agent shown in board pickers (comment @-mention, assignee). */
export interface BoardAgentOption {
  /** Agent identifier — passed to the backend as the task's agentId. */
  identifier: string;
  title: string;
  iconKey: string;
}

function toOption(agent: Agent): BoardAgentOption {
  return {
    identifier: agent.identifier,
    title: agent.title,
    iconKey: agent.iconKey ?? 'PiSparkle',
  };
}

/**
 * The agents a user can delegate board work to: their own created agents, agents
 * shared into their groups, and locale-visible system agents — the same sources the
 * Agentura page surfaces. Deduped by identifier (own > shared > system) and optionally
 * filtered by a query against title/identifier.
 */
export function useBoardAgentOptions(query = ''): BoardAgentOption[] {
  const { data: userAgents = [] } = useUserAgents();
  const { data: sharedUserAgents = [] } = useSharedUserAgents();
  const userLocale = useAuthStore((s) => s.locale) ?? 'de-DE';

  return useMemo(() => {
    const byIdentifier = new Map<string, BoardAgentOption>();
    for (const agent of userAgents) byIdentifier.set(agent.identifier, toOption(agent));
    for (const { agent } of sharedUserAgents) {
      if (!byIdentifier.has(agent.identifier)) byIdentifier.set(agent.identifier, toOption(agent));
    }
    for (const agent of getVisibleSystemAgentsForLocale(userLocale)) {
      if (!byIdentifier.has(agent.identifier)) byIdentifier.set(agent.identifier, toOption(agent));
    }

    const all = [...byIdentifier.values()];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (o) => o.title.toLowerCase().includes(q) || o.identifier.toLowerCase().includes(q)
    );
  }, [userAgents, sharedUserAgents, userLocale, query]);
}
