import { agentKey, agentRef } from '@gruenerator/shared/agents';
import { type UsageStat } from '@gruenerator/shared/utils';
import { useEffect, useMemo } from 'react';

import { useItemUsage } from '../../usage/useItemUsage';
import { pinnedFirst } from '../lib/marketFilter';
import { foreignEntry, ownEntry, sortBy, type AgentEntry } from '../lib/marketItems';

import type { ForeignAgent, SharedAgentEntry } from '../../agents/api';
import type { AgenturaSort } from '../lib/categories';
import type { Agent } from '@gruenerator/shared/agents';

import useAgentFavoritesStore from '@/stores/agentFavoritesStore';

/**
 * Jeder Agent, den die Person sehen kann, einmal — dazu Favoriten und Nutzung.
 * Übersicht und Agentura sehen beide jede Art von Agent, deshalb pflegen beide
 * hier die Titel-Schnappschüsse der Sidebar und ziehen alte Sterne um.
 */
export function useAgentIndex({
  userAgents,
  userAgentsLoaded,
  sharedAgents,
  communityAgents,
  systemAgents,
}: {
  userAgents: Agent[];
  userAgentsLoaded: boolean;
  sharedAgents: SharedAgentEntry[];
  communityAgents: ForeignAgent[];
  systemAgents: ForeignAgent[];
}) {
  const agentFavorites = useAgentFavoritesStore((s) => s.favoriteIdentifiers);
  const recordFavoriteTitles = useAgentFavoritesStore((s) => s.recordTitles);
  const rekeyFavorites = useAgentFavoritesStore((s) => s.rekey);
  const { data: agentUsage = {} } = useItemUsage('agent');

  const allAgentEntries = useMemo<AgentEntry[]>(() => {
    const map = new Map<string, AgentEntry>();
    const addForeign = (a: ForeignAgent) => {
      const key = agentKey(a);
      if (!map.has(key)) map.set(key, foreignEntry(a));
    };
    for (const a of userAgents) map.set(agentKey(a), ownEntry(a));
    for (const e of sharedAgents) addForeign(e.agent);
    for (const a of communityAgents) addForeign(a);
    for (const a of systemAgents) addForeign(a);
    return [...map.values()];
  }, [userAgents, sharedAgents, communityAgents, systemAgents]);

  const favoriteAgents = useMemo(
    () => allAgentEntries.filter((e) => agentFavorites.includes(agentRef(e.agent, e.isUser))),
    [allAgentEntries, agentFavorites]
  );

  // Refresh the sidebar's title snapshots — this also backfills favourites
  // starred before the store carried titles.
  useEffect(() => {
    recordFavoriteTitles(
      Object.fromEntries(favoriteAgents.map((e) => [agentRef(e.agent, e.isUser), e.agent.title]))
    );
  }, [favoriteAgents, recordFavoriteTitles]);

  // Stars on someone else's agent used to be stored under its identifier,
  // which also lit every other agent of that name. Move each to the uuid, but
  // only when that is unambiguous: the caller's own agents must have loaded
  // (before that, an own agent looks foreign and would lose its star), none of
  // them may carry the identifier, and exactly one foreign agent may.
  useEffect(() => {
    if (!userAgentsLoaded) return;
    const ownIdentifiers = new Set(userAgents.map((a) => a.identifier));
    const candidates = new Map<string, string[]>();
    for (const e of allAgentEntries) {
      const ref = agentRef(e.agent, e.isUser);
      if (ref === e.agent.identifier || ownIdentifiers.has(e.agent.identifier)) continue;
      candidates.set(e.agent.identifier, [...(candidates.get(e.agent.identifier) ?? []), ref]);
    }
    const moves: Record<string, string> = {};
    for (const [identifier, refs] of candidates) if (refs.length === 1) moves[identifier] = refs[0];
    rekeyFavorites(moves);
  }, [allAgentEntries, userAgents, userAgentsLoaded, rekeyFavorites]);

  // Usage is recorded under whatever the chat sent as `agentId`. A teammate's
  // agent used to be sent by identifier and now goes by uuid, so its older
  // usage sits under the identifier — carry it over unless one of the
  // caller's own agents has that identifier (then the usage may be theirs).
  const agentUsageByRef = useMemo(() => {
    const map = new Map<string, UsageStat>(
      agentUsage instanceof Map ? agentUsage : Object.entries(agentUsage)
    );
    const ownIdentifiers = new Set(userAgents.map((a) => a.identifier));
    for (const e of allAgentEntries) {
      const ref = agentRef(e.agent, e.isUser);
      const legacy = map.get(e.agent.identifier);
      if (
        ref !== e.agent.identifier &&
        legacy &&
        !map.has(ref) &&
        !ownIdentifiers.has(e.agent.identifier)
      )
        map.set(ref, legacy);
    }
    return map;
  }, [agentUsage, allAgentEntries, userAgents]);

  /** `empfohlen`: nach eigener Nutzung, angeheftete zuerst; `az`: alphabetisch. */
  const sortAgentEntries = (entries: AgentEntry[], sort: AgenturaSort) => {
    const sorted = sortBy(entries, sort, (e) => e.agent.title, {
      getId: (e) => agentRef(e.agent, e.isUser),
      map: agentUsageByRef,
    });
    return sort === 'empfohlen'
      ? pinnedFirst(sorted, (e) => Boolean(e.agent.pinnedToSidebar))
      : sorted;
  };

  return { allAgentEntries, favoriteAgents, sortAgentEntries };
}
