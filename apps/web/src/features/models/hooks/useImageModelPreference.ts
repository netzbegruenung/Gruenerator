import { DEFAULT_IMAGE_MODEL_ID, type ImageModelId } from '@gruenerator/shared/models';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  fetchImageModelPreference,
  updateImageModelPreference,
} from '../../../hooks/useImageModelPreferenceTyped';

const QUERY_KEY = ['image-model-preference'];

interface ImageModelPreferenceResponse {
  success: boolean;
  defaultImageModel: ImageModelId;
}

export interface UseImageModelPreferenceOptions {
  enabled?: boolean;
}

export function useImageModelPreference(options: UseImageModelPreferenceOptions = {}) {
  const { enabled = true } = options;
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => fetchImageModelPreference() as Promise<ImageModelPreferenceResponse>,
    staleTime: 60_000,
    enabled,
  });

  const mutation = useMutation({
    mutationFn: (modelId: ImageModelId) =>
      updateImageModelPreference(modelId) as Promise<ImageModelPreferenceResponse>,
    onMutate: async (modelId) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<ImageModelPreferenceResponse>(QUERY_KEY);
      queryClient.setQueryData(QUERY_KEY, { success: true, defaultImageModel: modelId });
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

  return {
    defaultImageModel: query.data?.defaultImageModel ?? DEFAULT_IMAGE_MODEL_ID,
    isLoading: query.isLoading,
    setDefaultImageModel: (modelId: ImageModelId) => mutation.mutateAsync(modelId),
    isSaving: mutation.isPending,
  };
}
