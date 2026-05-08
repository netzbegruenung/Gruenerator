import { type Agent } from '@gruenerator/shared/agents';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import apiClient from '../../components/utils/apiClient';

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
