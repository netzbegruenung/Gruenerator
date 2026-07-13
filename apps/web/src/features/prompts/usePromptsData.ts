/**
 * Hook for custom prompts data operations
 */
import { getContractsClient } from '@gruenerator/shared/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { useAuthStore } from '../../stores/authStore';

import type { CustomPrompt, CustomPromptCreateData, CustomPromptUpdateData } from './types';

const QUERY_KEYS = {
  customPrompts: (userId: string | undefined) => ['customPrompts', userId],
  savedPrompts: (userId: string | undefined) => ['savedPrompts', userId],
};

interface UseCustomPromptsOptions {
  isActive?: boolean;
  enabled?: boolean;
}

export const useCustomPromptsData = (options: UseCustomPromptsOptions = {}) => {
  const { isActive = true, enabled = true } = options;
  const user = useAuthStore((s) => s.user);

  const query = useQuery<CustomPrompt[], Error>({
    queryKey: QUERY_KEYS.customPrompts(user?.id),
    queryFn: async (): Promise<CustomPrompt[]> => {
      const res = await getContractsClient().prompts.listCustomPrompts();
      if (res.status === 200) return res.body.prompts;
      throw new Error('Prompts konnten nicht geladen werden.');
    },
    enabled: enabled && !!user?.id && isActive,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return { query };
};

export const useSavedPromptsData = (options: UseCustomPromptsOptions = {}) => {
  const { isActive = true, enabled = true } = options;
  const user = useAuthStore((s) => s.user);

  const query = useQuery<CustomPrompt[], Error>({
    queryKey: QUERY_KEYS.savedPrompts(user?.id),
    queryFn: async (): Promise<CustomPrompt[]> => {
      const res = await getContractsClient().prompts.listSavedPrompts();
      if (res.status === 200) return res.body.prompts;
      throw new Error('Gespeicherte Prompts konnten nicht geladen werden.');
    },
    enabled: enabled && !!user?.id && isActive,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return { query };
};

export const usePromptMutations = () => {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: async (data: CustomPromptCreateData): Promise<CustomPrompt> => {
      const res = await getContractsClient().prompts.createCustomPrompt({ body: data });
      if (res.status === 200 && res.body.prompt) return res.body.prompt;
      throw new Error('Prompt konnte nicht erstellt werden.');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.customPrompts(user?.id) });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: CustomPromptUpdateData): Promise<CustomPrompt> => {
      const { id, ...body } = data;
      const res = await getContractsClient().prompts.updateCustomPrompt({ params: { id }, body });
      if (res.status === 200 && res.body.prompt) return res.body.prompt;
      throw new Error('Prompt konnte nicht aktualisiert werden.');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.customPrompts(user?.id) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (promptId: string): Promise<void> => {
      const res = await getContractsClient().prompts.deleteCustomPrompt({
        params: { id: promptId },
      });
      if (res.status !== 200) throw new Error('Prompt konnte nicht gelöscht werden.');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.customPrompts(user?.id) });
    },
  });

  const unsaveMutation = useMutation({
    mutationFn: async (promptId: string): Promise<void> => {
      const res = await getContractsClient().prompts.deleteSavedPrompt({ params: { promptId } });
      if (res.status !== 200) throw new Error('Prompt konnte nicht entfernt werden.');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.savedPrompts(user?.id) });
    },
  });

  return {
    createPrompt: createMutation.mutateAsync,
    updatePrompt: updateMutation.mutateAsync,
    deletePrompt: deleteMutation.mutateAsync,
    unsavePrompt: unsaveMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isUnsaving: unsaveMutation.isPending,
  };
};
