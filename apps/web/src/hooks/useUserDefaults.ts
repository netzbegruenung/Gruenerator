import { useCallback } from 'react';

import {
  useSetUserDefault,
  useUserDefaultsQuery,
  type UserDefaultsGenerator,
  type UserDefaultsKey,
  type UserDefaultsValue,
} from '../features/user-defaults/userDefaultsQueries';

interface UseUserDefaultsReturn<T = unknown> {
  get: (key: string, defaultValue?: T) => T;
  set: (key: string, value: T) => Promise<void>;
  isLoading: boolean;
  isHydrated: boolean;
}

/**
 * Generic generator-scoped wrapper. Prefer the typed `useUserDefault(generator, key)`
 * for new call sites; this wrapper exists for legacy consumers that use dynamic keys
 * (notifications, boards, popups).
 */
export const useUserDefaults = <T = unknown>(
  generator: UserDefaultsGenerator
): UseUserDefaultsReturn<T> => {
  const query = useUserDefaultsQuery();
  const mutation = useSetUserDefault();

  const get = useCallback(
    (key: string, defaultValue?: T): T => {
      const data = query.data as Record<string, Record<string, unknown> | undefined> | undefined;
      const value = data?.[generator]?.[key];
      return (value ?? defaultValue) as T;
    },
    [query.data, generator]
  );

  const set = useCallback(
    async (key: string, value: T): Promise<void> => {
      await mutation.mutateAsync({
        generator,
        key: key as UserDefaultsKey<typeof generator>,
        value: value as UserDefaultsValue<typeof generator, UserDefaultsKey<typeof generator>>,
      });
    },
    [generator, mutation]
  );

  return {
    get,
    set,
    isLoading: query.isPending,
    isHydrated: query.isSuccess,
  };
};

export default useUserDefaults;
