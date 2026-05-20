import { getContractsClient } from '@gruenerator/shared/api';
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
      const response = await apiClient.get<{ userDefaults?: UserDefaultsBlob }>(
        '/auth/profile/user-defaults',
        { skipAuthRedirect: true }
      );
      return response.data.userDefaults ?? {};
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
      const res = await getContractsClient().userProfile.updateUserDefaults({
        body: { generator, key, value },
      });
      if (res.status !== 200) {
        throw new Error(`Failed to save user default (HTTP ${res.status})`);
      }
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
