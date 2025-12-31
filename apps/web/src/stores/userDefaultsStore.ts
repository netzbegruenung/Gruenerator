import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import apiClient from '../components/utils/apiClient';

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
export const useUserDefaultsStore = create(
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
        } catch (error) {
          console.warn('[userDefaultsStore] Failed to hydrate:', error.message);
          set({ isHydrated: true, isLoading: false });
        }
      },

      /**
       * Get a default value for a generator
       */
      getDefault: (generator, key, defaultValue = null) => {
        return get().defaults?.[generator]?.[key] ?? defaultValue;
      },

      /**
       * Set a default value (optimistic update + API call)
       */
      setDefault: async (generator, key, value) => {
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
        } catch (error) {
          console.error('[userDefaultsStore] Failed to save default:', error.message);
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
