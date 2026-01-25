/**
 * Hook for custom prompts data operations
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import apiClient from '../../components/utils/apiClient';
import { useOptimizedAuth } from '../../hooks/useAuth';

import type { CustomPrompt, CustomPromptCreateData, CustomPromptUpdateData } from './types';

const QUERY_KEYS = {
  customPrompts: (userId: string | undefined) => ['customPrompts', userId],
};

interface UseCustomPromptsOptions {
  isActive?: boolean;
  enabled?: boolean;
}

export const useCustomPromptsData = (options: UseCustomPromptsOptions = {}) => {
  const { isActive = true, enabled = true } = options;
  const { user } = useOptimizedAuth();

  const query = useQuery<CustomPrompt[], Error>({
    queryKey: QUERY_KEYS.customPrompts(user?.id),
    queryFn: async (): Promise<CustomPrompt[]> => {
      const response = await apiClient.get('/auth/custom_prompts');
      return response.data?.prompts || [];
    },
    enabled: enabled && !!user?.id && isActive,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return { query };
};

export const usePromptMutations = () => {
  const { user } = useOptimizedAuth();
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: async (data: CustomPromptCreateData): Promise<CustomPrompt> => {
      const response = await apiClient.post('/auth/custom_prompts', data);
      return response.data?.prompt;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.customPrompts(user?.id) });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: CustomPromptUpdateData): Promise<CustomPrompt> => {
      const { id, ...updateData } = data;
      const response = await apiClient.put(`/auth/custom_prompts/${id}`, updateData);
      return response.data?.prompt;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.customPrompts(user?.id) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (promptId: string): Promise<void> => {
      await apiClient.delete(`/auth/custom_prompts/${promptId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.customPrompts(user?.id) });
    },
  });

  return {
    createPrompt: createMutation.mutateAsync,
    updatePrompt: updateMutation.mutateAsync,
    deletePrompt: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
};
