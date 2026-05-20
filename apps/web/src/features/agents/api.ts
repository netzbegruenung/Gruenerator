import { SYSTEM_AGENTS, type Agent } from '@gruenerator/shared/agents';
import { getContractsClient } from '@gruenerator/shared/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import apiClient from '../../components/utils/apiClient';
import { useGroups, type GroupSummary } from '../groups/hooks/useGroups';

export interface UserAgentInput {
  identifier: string;
  title: string;
  description: string;
  systemRole: string;
  avatar: string;
  backgroundColor: string;
  tags: string[];
  model: string;
  provider: 'mistral' | 'anthropic' | 'litellm' | 'regolo';
  params: { max_tokens: number; temperature: number };
  openingMessage: string;
  openingQuestions: string[];
  locale: string;
  author: string;
  enabledTools?: string[];
}

export type UserAgentPatch = Partial<Omit<UserAgentInput, 'identifier'>>;

const KEY = ['user-agents'] as const;

export function useUserAgents() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<Agent[]> => {
      const { data } = await apiClient.get<{ success: boolean; agents: Agent[] }>('/user-agents');
      return data.agents ?? [];
    },
  });
}

export function useUserAgent(identifier: string | undefined) {
  return useQuery({
    queryKey: [...KEY, identifier],
    enabled: !!identifier,
    queryFn: async (): Promise<Agent | null> => {
      if (!identifier) return null;
      const { data } = await apiClient.get<{ success: boolean; agent: Agent }>(
        `/user-agents/${identifier}`
      );
      return data.agent ?? null;
    },
  });
}

export function useCreateUserAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UserAgentInput): Promise<Agent> => {
      const { data } = await apiClient.post<{ success: boolean; agent: Agent }>(
        '/user-agents',
        input
      );
      return data.agent;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

export function useUpdateUserAgent(identifier: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: UserAgentPatch): Promise<Agent> => {
      const { data } = await apiClient.patch<{ success: boolean; agent: Agent }>(
        `/user-agents/${identifier}`,
        patch
      );
      return data.agent;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

/**
 * Convert a custom_generators row into a real user_agents row.
 * Returns the new agent on 201, or { conflict: true, agent } on 409
 * (CG already converted), or throws on other errors.
 */
export function useConvertCustomGenerator() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (slug: string): Promise<{ agent: Agent; conflict: boolean }> => {
      try {
        const { data } = await apiClient.post<{ success: boolean; agent: Agent }>(
          `/user-agents/convert-cg/${encodeURIComponent(slug)}`
        );
        return { agent: data.agent, conflict: false };
      } catch (err) {
        const e = err as { response?: { status?: number; data?: { agent?: Agent } } };
        if (e.response?.status === 409 && e.response.data?.agent) {
          return { agent: e.response.data.agent, conflict: true };
        }
        throw err;
      }
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

export function useDeleteUserAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (identifier: string): Promise<void> => {
      await apiClient.delete(`/user-agents/${identifier}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
    },
  });
}
