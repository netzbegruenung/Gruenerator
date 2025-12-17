import { useCallback, useEffect } from 'react';
import { useUserDefaultsStore } from '../stores/userDefaultsStore';

/**
 * Hook for accessing generator-specific user defaults
 *
 * @param {string} generator - The generator type (e.g., 'antrag', 'pressemitteilung')
 * @returns {Object} { get, set, isLoading }
 *
 * @example
 * const { get, set } = useUserDefaults('antrag');
 * const interactiveMode = get('interactiveMode', true);
 * set('interactiveMode', false);
 */
export const useUserDefaults = (generator) => {
  const getDefault = useUserDefaultsStore((state) => state.getDefault);
  const setDefault = useUserDefaultsStore((state) => state.setDefault);
  const hydrate = useUserDefaultsStore((state) => state.hydrate);
  const isHydrated = useUserDefaultsStore((state) => state.isHydrated);
  const isLoading = useUserDefaultsStore((state) => state.isLoading);

  // Hydrate on first use
  useEffect(() => {
    if (!isHydrated) {
      hydrate();
    }
  }, [isHydrated, hydrate]);

  const get = useCallback(
    (key, defaultValue = null) => {
      return getDefault(generator, key, defaultValue);
    },
    [generator, getDefault]
  );

  const set = useCallback(
    async (key, value) => {
      return setDefault(generator, key, value);
    },
    [generator, setDefault]
  );

  return {
    get,
    set,
    isLoading,
    isHydrated
  };
};

export default useUserDefaults;
