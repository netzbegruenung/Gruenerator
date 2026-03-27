import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import apiClient from '../../../components/utils/apiClient';

interface ChannelPreferences {
  email: boolean;
  push: boolean;
  in_app: boolean;
}

interface NotificationPreferencesResponse {
  success: boolean;
  preferences: Record<string, ChannelPreferences>;
  defaults: Record<string, ChannelPreferences>;
}

const QUERY_KEY = ['notification-preferences'];

export function useNotificationPreferences() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await apiClient.get<NotificationPreferencesResponse>(
        '/auth/profile/notification-preferences'
      );
      return res.data;
    },
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: async ({
      category,
      channels,
    }: {
      category: string;
      channels: Partial<ChannelPreferences>;
    }) => {
      const res = await apiClient.patch<NotificationPreferencesResponse>(
        '/auth/profile/notification-preferences',
        { category, channels }
      );
      return res.data;
    },
    onMutate: async ({ category, channels }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<NotificationPreferencesResponse>(QUERY_KEY);

      if (previous) {
        const updated = {
          ...previous,
          preferences: {
            ...previous.preferences,
            [category]: {
              ...previous.preferences[category],
              ...channels,
            },
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
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  return {
    preferences: query.data?.preferences ?? {},
    defaults: query.data?.defaults ?? {},
    isLoading: query.isLoading,
    toggleChannel: (category: string, channel: keyof ChannelPreferences, value: boolean) =>
      mutation.mutateAsync({ category, channels: { [channel]: value } }),
    isSaving: mutation.isPending,
  };
}
