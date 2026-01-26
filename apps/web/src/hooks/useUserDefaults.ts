import { useCallback, useEffect } from 'react';

import { useUserDefaultsStore } from '../stores/userDefaultsStore';

// Types for user defaults store
interface UserDefaultsState {
  defaults: Record<string, Record<string, unknown>>;
  isHydrated: boolean;
  isLoading: boolean;
  getDefault: <T = unknown>(generator: string, key: string, defaultValue?: T) => T;
  setDefault: (generator: string, key: string, value: unknown) => Promise<void>;
  hydrate: () => Promise<void>;
  reset: () => void;
}

interface UseUserDefaultsReturn<T = unknown> {
  get: (key: string, defaultValue?: T) => T;
  set: (key: string, value: T) => Promise<void>;
  isLoading: boolean;
  isHydrated: boolean;
}

/**
 * Hook for accessing generator-specific user defaults
 *
 * @param generator - The generator type (e.g., 'antrag', 'pressemitteilung')
 * @returns { get, set, isLoading, isHydrated }
 *
 * @example
 * const { get, set } = useUserDefaults('antrag');
 * const interactiveMode = get('interactiveMode', true);
 * set('interactiveMode', false);
 */
export const useUserDefaults = <T = unknown>(generator: string): UseUserDefaultsReturn<T> => {
  const getDefault = useUserDefaultsStore((state: UserDefaultsState) => state.getDefault);
  const setDefault = useUserDefaultsStore((state: UserDefaultsState) => state.setDefault);
  const hydrate = useUserDefaultsStore((state: UserDefaultsState) => state.hydrate);
  const isHydrated = useUserDefaultsStore((state: UserDefaultsState) => state.isHydrated);
  const isLoading = useUserDefaultsStore((state: UserDefaultsState) => state.isLoading);

  // Hydrate on first use
  useEffect(() => {
    if (!isHydrated) {
      hydrate();
    }
  }, [isHydrated, hydrate]);

  const get = useCallback(
    (key: string, defaultValue?: T): T => {
      return getDefault<T>(generator, key, defaultValue);
    },
    [generator, getDefault]
  );

  const set = useCallback(
    async (key: string, value: T): Promise<void> => {
      return setDefault(generator, key, value);
    },
    [generator, setDefault]
  );

  return {
    get,
    set,
    isLoading,
    isHydrated,
  };
};

export default useUserDefaults;
