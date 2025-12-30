import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// Auth Backend URL aus Environment Variable oder Fallback zu aktuellem Host
const AUTH_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

// Normalize backend keys to frontend camelCase keys
const normalizeBetaFeatures = (features = {}) => {
  const keyMap = {
    groups_enabled: 'groups',
    database_access: 'database',
    igel_modus: 'igel_modus',
    collab: 'collab',
    notebook: 'notebook',
    sharepic: 'sharepic',
    anweisungen: 'anweisungen',
    content_management: 'contentManagement',
    canva: 'canva',
    chat: 'chat',
    labor_enabled: 'labor'
  };

  const normalized = {};
  for (const [key, value] of Object.entries(features || {})) {
    const mappedKey = keyMap[key] || key;
    normalized[mappedKey] = !!value;
  }
  return normalized;
};

export const useBetaFeaturesStore = create(persist((set, get) => ({
  userId: null,
  betaFeatures: {},
  isHydrated: false,
  isUpdating: false,
  error: null,
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
      const response = await fetch(`${AUTH_BASE_URL}/auth/profile/beta-features`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        set({ error: `Backend fetch error: ${response.status}`, isHydrated: true });
        return;
      }

      const result = await response.json();
      const features = normalizeBetaFeatures(result?.betaFeatures || {});
      set({
        userId,
        betaFeatures: features,
        isHydrated: true,
        error: null,
        lastUpdatedAt: Date.now()
      });
    } catch (e) {
      set({ error: e?.message || 'Failed to hydrate beta features', isHydrated: true });
    }
  },

  // Optimistic toggle with rollback on error
  toggle: async (featureKey, enabled) => {
    const previous = get().betaFeatures;
    const optimistic = { ...previous, [featureKey]: !!enabled };
    set({ betaFeatures: optimistic, isUpdating: true, error: null });

    try {
      const response = await fetch(`${AUTH_BASE_URL}/auth/profile/beta-features`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ feature: featureKey, enabled: !!enabled })
      });

      const result = await response.json();
      if (!response.ok || !result?.success) {
        throw new Error(result?.message || 'Beta Feature Update fehlgeschlagen');
      }

      const confirmed = normalizeBetaFeatures(result?.betaFeatures || {});
      set({ betaFeatures: confirmed, isUpdating: false, error: null, lastUpdatedAt: Date.now() });
    } catch (e) {
      set({ betaFeatures: previous, isUpdating: false, error: e?.message || 'Update failed' });
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
      lastUpdatedAt: 0
    });
  }
}), {
  name: 'beta-features',
  version: 1,
  storage: createJSONStorage(() => localStorage)
}));

export default useBetaFeaturesStore;


