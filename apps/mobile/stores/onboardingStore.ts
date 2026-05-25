import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface OnboardingState {
  hasCompletedOnboarding: boolean;
  // Tracks whether the persisted flag has loaded from AsyncStorage yet. The root
  // layout's redirect gate must wait for this, otherwise it reads the default
  // `false` on the first frame and flashes the carousel at a returning user
  // before the stored `true` rehydrates. Not persisted (see partialize).
  hasHydrated: boolean;
}

interface OnboardingActions {
  completeOnboarding: () => void;
  setHasHydrated: (value: boolean) => void;
}

export const useOnboardingStore = create<OnboardingState & OnboardingActions>()(
  persist(
    (set) => ({
      hasCompletedOnboarding: false,
      hasHydrated: false,

      completeOnboarding: () => set({ hasCompletedOnboarding: true }),
      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: 'gruenerator-onboarding',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ hasCompletedOnboarding: state.hasCompletedOnboarding }),
      onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
    }
  )
);
