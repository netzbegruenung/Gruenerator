import { type ModelId } from '@gruenerator/shared/models';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import {
  fetchModelPreferences,
  updateModelPreference,
} from '../../../hooks/useModelPreferencesTyped';

interface ModelPreference {
  enabled: boolean;
}

interface ModelPreferencesResponse {
  success: boolean;
  preferences: Record<string, ModelPreference>;
  defaults: Record<string, ModelPreference>;
}

const QUERY_KEY = ['model-preferences'];

export interface UseModelPreferencesOptions {
  enabled?: boolean;
}

export function useModelPreferences(options: UseModelPreferencesOptions = {}) {
  const { enabled = true } = options;
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      return fetchModelPreferences() as Promise<ModelPreferencesResponse>;
    },
    staleTime: 60_000,
    enabled,
  });

  const mutation = useMutation({
    mutationFn: async ({ modelId, enabled }: { modelId: ModelId; enabled: boolean }) => {
      return updateModelPreference(modelId, enabled) as Promise<ModelPreferencesResponse>;
    },
    onMutate: async ({ modelId, enabled }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<ModelPreferencesResponse>(QUERY_KEY);

      if (previous) {
        const updated: ModelPreferencesResponse = {
          ...previous,
          preferences: {
            ...previous.preferences,
            [modelId]: { enabled },
          },
        };
        queryClient.setQueryData(QUERY_KEY, updated);
      }

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEY, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const preferences = query.data?.preferences ?? {};

  const enabledModelIds = useMemo(() => {
    if (!query.data) return null;
    const set = new Set<ModelId>();
    for (const [id, pref] of Object.entries(preferences)) {
      if (pref?.enabled) set.add(id as ModelId);
    }
    return set;
  }, [preferences, query.data]);

  return {
    preferences,
    defaults: query.data?.defaults ?? {},
    enabledModelIds,
    isLoading: query.isLoading,
    toggleModel: (modelId: ModelId, enabled: boolean) => mutation.mutateAsync({ modelId, enabled }),
    isSaving: mutation.isPending,
  };
}
