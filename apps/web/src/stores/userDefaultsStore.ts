import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import apiClient from '../components/utils/apiClient';

// Types
interface UserDefaults {
  [generator: string]: {
    [key: string]: unknown;
  };
}

interface UserDefaultsState {
  defaults: UserDefaults;
  isHydrated: boolean;
  isLoading: boolean;
}

interface UserDefaultsActions {
  hydrate: () => Promise<void>;
  getDefault: <T = unknown>(generator: string, key: string, defaultValue?: T) => T;
  setDefault: (generator: string, key: string, value: unknown) => Promise<void>;
  reset: () => void;
}

type UserDefaultsStore = UserDefaultsState & UserDefaultsActions;

/**
 * User Defaults Store
 *
 * Stores generator-specific user preferences in PostgreSQL.
 * Structure: { generatorType: { key: value } }
 *
 * Example:
 * {
 *   "antrag": { "interactiveMode": true },
 *   "pressemitteilung": { "interactiveMode": false }
 * }
 */
export const useUserDefaultsStore = create<UserDefaultsStore>()(
  persist(
    (set, get) => ({
      defaults: {},
      isHydrated: false,
      isLoading: false,

      /**
       * Hydrate store from backend
       */
      hydrate: async () => {
        if (get().isHydrated) return;

        set({ isLoading: true });
        try {
          const response = await apiClient.get('/auth/profile/user-defaults');
          set({
            defaults: response.data.userDefaults || {},
            isHydrated: true,
            isLoading: false
          });
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.warn('[userDefaultsStore] Failed to hydrate:', errorMessage);
          set({ isHydrated: true, isLoading: false });
        }
      },

      /**
       * Get a default value for a generator
       */
      getDefault: <T = unknown>(generator: string, key: string, defaultValue: T = null as T): T => {
        return (get().defaults?.[generator]?.[key] as T) ?? defaultValue;
      },

      /**
       * Set a default value (optimistic update + API call)
       */
      setDefault: async (generator: string, key: string, value: unknown) => {
        const prev = get().defaults;

        // Optimistic update
        set({
          defaults: {
            ...prev,
            [generator]: {
              ...(prev[generator] || {}),
              [key]: value
            }
          }
        });

        try {
          await apiClient.patch('/auth/profile/user-defaults', {
            generator,
            key,
            value
          });
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error('[userDefaultsStore] Failed to save default:', errorMessage);
          // Rollback on error
          set({ defaults: prev });
          throw error;
        }
      },

      /**
       * Reset hydration state (for logout)
       */
      reset: () => {
        set({ defaults: {}, isHydrated: false, isLoading: false });
      }
    }),
    {
      name: 'user-defaults',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ defaults: state.defaults })
    }
  )
);

export default useUserDefaultsStore;
