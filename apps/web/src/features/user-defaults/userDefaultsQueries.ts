import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import apiClient from '../../components/utils/apiClient';
import { useAuthStore } from '../../stores/authStore';

import {
  type UserDefaultsBlob,
  type UserDefaultsGenerator,
  type UserDefaultsKey,
  type UserDefaultsValue,
} from './userDefaultsSchema';

export type {
  UserDefaultsBlob,
  UserDefaultsGenerator,
  UserDefaultsKey,
  UserDefaultsValue,
} from './userDefaultsSchema';

export const USER_DEFAULTS_QUERY_KEY = ['user-defaults'] as const;

export function useUserDefaultsQuery() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return useQuery({
    queryKey: USER_DEFAULTS_QUERY_KEY,
    queryFn: async (): Promise<UserDefaultsBlob> => {
      console.log('[user-defaults] fetch start');
      const response = await apiClient.get<{ userDefaults?: UserDefaultsBlob }>(
        '/auth/profile/user-defaults',
        { skipAuthRedirect: true }
      );
      const blob = response.data.userDefaults ?? {};
      console.log('[user-defaults] fetch ok', {
        keys: Object.keys(blob),
        profileRoles: (blob as { profile?: { roles?: unknown } }).profile?.roles,
      });
      return blob;
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUserDefault<G extends UserDefaultsGenerator, K extends UserDefaultsKey<G>>(
  generator: G,
  key: K
) {
  const query = useUserDefaultsQuery();
  const value = query.data?.[generator]?.[key] as UserDefaultsValue<G, K> | undefined;
  return {
    value,
    isPending: query.isPending,
    isError: query.isError,
    isFetching: query.isFetching,
  };
}

interface SetUserDefaultVariables<G extends UserDefaultsGenerator, K extends UserDefaultsKey<G>> {
  generator: G;
  key: K;
  value: UserDefaultsValue<G, K>;
}

export function useSetUserDefault<G extends UserDefaultsGenerator, K extends UserDefaultsKey<G>>() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ generator, key, value }: SetUserDefaultVariables<G, K>) => {
      console.log('[user-defaults] mutate', { generator, key, value });
      await apiClient.patch('/auth/profile/user-defaults', { generator, key, value });
      console.log('[user-defaults] mutate ok', { generator, key });
    },
    onMutate: async ({ generator, key, value }) => {
      await queryClient.cancelQueries({ queryKey: USER_DEFAULTS_QUERY_KEY });
      const previous = queryClient.getQueryData<UserDefaultsBlob>(USER_DEFAULTS_QUERY_KEY);
      queryClient.setQueryData<UserDefaultsBlob>(USER_DEFAULTS_QUERY_KEY, (current) => {
        const next: UserDefaultsBlob = { ...(current ?? {}) };
        const generatorBlob = { ...(next[generator] ?? {}) } as Record<string, unknown>;
        generatorBlob[key as string] = value;
        next[generator] = generatorBlob as UserDefaultsBlob[G];
        return next;
      });
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(USER_DEFAULTS_QUERY_KEY, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: USER_DEFAULTS_QUERY_KEY });
    },
  });
}
