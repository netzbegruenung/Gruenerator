import {
  type CreateUserAgentBody,
  type UpdateUserAgentBody,
  type DraftedAgentSpec,
} from '@gruenerator/contracts';
import { SYSTEM_AGENTS, type Agent } from '@gruenerator/shared/agents';
import { getContractsClient } from '@gruenerator/shared/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import apiClient from '../../components/utils/apiClient';
import { useGroups, type GroupSummary } from '../groups/hooks/useGroups';

// Derived from the ts-rest contract schemas — the single source of truth for
// the /api/user-agents request shapes.
export type UserAgentInput = CreateUserAgentBody;
export type UserAgentPatch = UpdateUserAgentBody;

const KEY = ['user-agents'] as const;

/**
 * Read an error response body defensively. ts-rest's client response union
 * includes an `{ status: number; body: unknown }` fallback for undeclared
 * statuses, so in an error branch `res.body` collapses to `unknown`. One
 * boundary cast extracts the known error shape (message + optional conflict
 * agent).
 */
function readError(body: unknown): { message: string; agent: Agent | null } {
  const obj = (body ?? {}) as { message?: unknown; agent?: Agent };
  return {
    message: typeof obj.message === 'string' ? obj.message : 'Aktion fehlgeschlagen.',
    agent: obj.agent ?? null,
  };
}

export function useUserAgents() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<Agent[]> => {
      const res = await getContractsClient().userAgents.list();
      if (res.status === 200) return res.body.agents;
      throw new Error('Agent*innen konnten nicht geladen werden.');
    },
  });
}

export function useUserAgent(identifier: string | undefined) {
  return useQuery({
    queryKey: [...KEY, identifier],
    enabled: !!identifier,
    queryFn: async (): Promise<Agent | null> => {
      if (!identifier) return null;
      const res = await getContractsClient().userAgents.get({ params: { identifier } });
      if (res.status === 200) return res.body.agent;
      if (res.status === 404) return null;
      throw new Error('Agent*in konnte nicht geladen werden.');
    },
  });
}

export function useCreateUserAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UserAgentInput): Promise<Agent> => {
      const res = await getContractsClient().userAgents.create({ body: input });
      if (res.status === 201) return res.body.agent;
      throw new Error(readError(res.body).message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

/**
 * Synthesize an agent spec from either a one-shot freeform brief
 * (`{ description }`, the guided-assistant start screen) or a creator
 * conversation (`{ threadId }`). The backend runs a Mistral structured-
 * generation pass and returns the validated spec to pre-fill the wizard.
 */
export function useDraftAgent() {
  return useMutation({
    mutationFn: async (
      input: { threadId: string } | { description: string }
    ): Promise<DraftedAgentSpec> => {
      const res = await getContractsClient().userAgents.draft({ body: input });
      if (res.status === 200) return res.body.spec;
      throw new Error(readError(res.body).message);
    },
  });
}

export function useUpdateUserAgent(identifier: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: UserAgentPatch): Promise<Agent> => {
      const res = await getContractsClient().userAgents.update({
        params: { identifier },
        body: patch,
      });
      if (res.status === 200) return res.body.agent;
      throw new Error(readError(res.body).message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

export function useShareSystemAgentWithGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupId, identifier }: { groupId: string; identifier: string }) => {
      const res = await getContractsClient().groups.shareContent({
        params: { groupId },
        body: {
          contentType: 'system_agents',
          contentId: identifier,
          permissions: { read: true, write: false, collaborative: false },
        },
      });
      if (res.status !== 200) throw new Error('share failed');
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['shared-system-agents'] });
    },
  });
}

export interface SharedAgentEntry {
  agent: Agent;
  groups: GroupSummary[];
}

/**
 * Aggregates system agents shared into any group the current user belongs to.
 * One round-trip per group; groups list is cached by useGroups.
 */
export function useSharedSystemAgents() {
  const { userGroups } = useGroups({ isActive: true });
  const groupIds = userGroups.map((g) => g.id).sort();

  return useQuery({
    queryKey: ['shared-system-agents', groupIds],
    enabled: groupIds.length > 0,
    queryFn: async (): Promise<SharedAgentEntry[]> => {
      const results = await Promise.all(
        userGroups.map(async (group) => {
          const { data } = await apiClient.get<{
            success: boolean;
            content?: { system_agents?: Array<{ id: string }> };
          }>(`/auth/groups/${group.id}/content`);
          const ids = data.content?.system_agents?.map((s) => s.id) ?? [];
          return { group, ids };
        })
      );

      // Deduplicate by identifier; collect which groups each comes from.
      const byIdentifier = new Map<string, SharedAgentEntry>();
      for (const { group, ids } of results) {
        for (const id of ids) {
          const agent = SYSTEM_AGENTS.find((a) => a.identifier === id);
          if (!agent) continue;
          const existing = byIdentifier.get(id);
          if (existing) {
            existing.groups.push(group);
          } else {
            byIdentifier.set(id, { agent, groups: [group] });
          }
        }
      }
      return [...byIdentifier.values()];
    },
  });
}

/**
 * Aggregates USER-created agents shared into any group the current user belongs
 * to. Mirrors useSharedSystemAgents, but each group's `/content` bucket already
 * carries the full agent (no static registry to resolve against). One
 * round-trip per group; groups list is cached by useGroups.
 */
export function useSharedUserAgents() {
  const { userGroups } = useGroups({ isActive: true });
  const groupIds = userGroups.map((g) => g.id).sort();

  return useQuery({
    queryKey: ['shared-user-agents', groupIds],
    enabled: groupIds.length > 0,
    queryFn: async (): Promise<SharedAgentEntry[]> => {
      const results = await Promise.all(
        userGroups.map(async (group) => {
          const { data } = await apiClient.get<{
            success: boolean;
            content?: { user_agents?: Agent[] };
          }>(`/auth/groups/${group.id}/content`);
          return { group, agents: data.content?.user_agents ?? [] };
        })
      );

      // Deduplicate by identifier; collect which groups each comes from.
      const byIdentifier = new Map<string, SharedAgentEntry>();
      for (const { group, agents } of results) {
        for (const agent of agents) {
          const existing = byIdentifier.get(agent.identifier);
          if (existing) {
            existing.groups.push(group);
          } else {
            byIdentifier.set(agent.identifier, { agent, groups: [group] });
          }
        }
      }
      return [...byIdentifier.values()];
    },
  });
}

/** Public Agentura discovery feed: agents listed publicly, locale-filtered server-side. */
export function usePublicUserAgents() {
  return useQuery({
    queryKey: ['public-user-agents'],
    queryFn: async (): Promise<Agent[]> => {
      const res = await getContractsClient().userAgentsSharing.listPublic();
      if (res.status === 200) return res.body.agents;
      throw new Error('Öffentliche Agent*innen konnten nicht geladen werden.');
    },
  });
}

export function useDeleteUserAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (identifier: string): Promise<void> => {
      const res = await getContractsClient().userAgents.remove({ params: { identifier } });
      if (res.status !== 200) throw new Error('Löschen fehlgeschlagen.');
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
    },
  });
}
