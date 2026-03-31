import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import apiClient from '../components/utils/apiClient';

// Types
interface BetaFeatures {
  [key: string]: boolean;
}

interface BetaFeaturesState {
  userId: string | null;
  betaFeatures: BetaFeatures;
  isHydrated: boolean;
  isUpdating: boolean;
  error: string | null;
  lastUpdatedAt: number;
}

interface BetaFeaturesActions {
  hydrate: (userId: string) => Promise<void>;
  toggle: (featureKey: string, enabled: boolean) => Promise<void>;
  resetForUser: (userId?: string | null) => void;
}

type BetaFeaturesStore = BetaFeaturesState & BetaFeaturesActions;

// Feature groups: a single toggle controls multiple backend features
export const FEATURE_GROUPS: Record<string, string[]> = {};

// Normalize backend keys to frontend camelCase keys
const normalizeBetaFeatures = (features: Record<string, unknown> = {}): BetaFeatures => {
  const keyMap: Record<string, string> = {
    database_access: 'database',
    collab: 'collab',
    notebook: 'notebook',
    sharepic: 'sharepic',
    anweisungen: 'anweisungen',
    content_management: 'contentManagement',
    canva: 'canva',
    labor_enabled: 'labor',
    memory_enabled: 'memories',
  };

  const normalized: BetaFeatures = {};
  for (const [key, value] of Object.entries(features || {})) {
    const mappedKey = keyMap[key] || key;
    normalized[mappedKey] = !!value;
  }

  // Derive group parent keys from children
  for (const [groupKey, children] of Object.entries(FEATURE_GROUPS)) {
    normalized[groupKey] = children.every((child) => !!normalized[child]);
  }

  return normalized;
};

export const useBetaFeaturesStore = create<BetaFeaturesStore>()(
  persist(
    (set, get) => ({
      userId: null as string | null,
      betaFeatures: {} as BetaFeatures,
      isHydrated: false,
      isUpdating: false,
      error: null as string | null,
      lastUpdatedAt: 0,

      // Simplified hydrate function with early return optimization
      hydrate: async (userId) => {
        if (!userId) return;
        const state = get();

        // Early return to prevent unnecessary API calls and state updates
        if (state.userId === userId && state.isHydrated && !state.error) {
          return;
        }

        try {
          const response = await apiClient.get('/auth/profile/beta-features', {
            skipAuthRedirect: true,
          });
          const result = response.data;
          const features = normalizeBetaFeatures(result?.betaFeatures || {});
          set({
            userId,
            betaFeatures: features,
            isHydrated: true,
            error: null,
            lastUpdatedAt: Date.now(),
          });
        } catch (e) {
          const errorMessage = e instanceof Error ? e.message : 'Failed to hydrate beta features';
          set({ error: errorMessage, isHydrated: true });
        }
      },

      // Optimistic toggle with rollback on error
      // If featureKey is a group parent, toggles all child features on the backend
      toggle: async (featureKey: string, enabled: boolean) => {
        const previous = get().betaFeatures;
        const childKeys = FEATURE_GROUPS[featureKey];

        // Build optimistic state
        const optimistic = { ...previous, [featureKey]: !!enabled };
        if (childKeys) {
          for (const child of childKeys) {
            optimistic[child] = !!enabled;
          }
        }
        set({ betaFeatures: optimistic, isUpdating: true, error: null });

        try {
          // For group keys, send a PATCH for each child feature
          const keysToToggle = childKeys ?? [featureKey];
          await Promise.all(
            keysToToggle.map((key) =>
              apiClient.patch(
                '/auth/profile/beta-features',
                { feature: key, enabled: !!enabled },
                { skipAuthRedirect: true }
              )
            )
          );

          // Re-fetch to get consistent state after all writes
          const response = await apiClient.get('/auth/profile/beta-features', {
            skipAuthRedirect: true,
          });
          const confirmed = normalizeBetaFeatures(response.data?.betaFeatures || {});
          set({
            betaFeatures: confirmed,
            isUpdating: false,
            error: null,
            lastUpdatedAt: Date.now(),
          });
        } catch (e) {
          const errorMessage = e instanceof Error ? e.message : 'Update failed';
          set({ betaFeatures: previous, isUpdating: false, error: errorMessage });
          throw e;
        }
      },

      // Reset store when user changes or logs out
      resetForUser: (userId = null) => {
        set({
          userId,
          betaFeatures: {},
          isHydrated: false,
          isUpdating: false,
          error: null,
          lastUpdatedAt: 0,
        });
      },
    }),
    {
      name: 'beta-features',
      version: 1,
      storage: createJSONStorage(() => localStorage),
    }
  )
);

export default useBetaFeaturesStore;
