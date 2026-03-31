import React, { useEffect, useMemo } from 'react';

import { useAuthStore } from '../stores/authStore';
import { useBetaFeaturesStore, FEATURE_GROUPS } from '../stores/betaFeaturesStore';

// Types for beta features store
interface BetaFeaturesState {
  betaFeatures: Record<string, boolean>;
  isHydrated: boolean;
  isUpdating: boolean;
  error: string | null;
  userId: string | null;
  toggle: (featureKey: string, enabled: boolean) => Promise<void>;
  hydrate: (userId: string) => Promise<void>;
}

interface BetaFeatureConfig {
  key: string;
  label: string;
  isAdminOnly: boolean;
  devOnly?: boolean;
  defaultEnabled?: boolean;
  isProfileSetting?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface UseBetaFeaturesOptions {
  // Placeholder for future options
}

interface UseBetaFeaturesReturn {
  betaFeatures: Record<string, boolean>;
  isLoading: boolean;
  isError: boolean;
  error: string | null;
  getBetaFeatureState: (key: string) => boolean;
  canAccessBetaFeature: (featureKey: string) => boolean;
  shouldShowTab: (featureKey: string) => boolean;
  availableFeatures: BetaFeatureConfig[];
  getAvailableFeatures: () => BetaFeatureConfig[];
  updateUserBetaFeatures: (featureKey: string, isEnabled: boolean) => Promise<void>;
  isAdmin: boolean;
  adminOnlyFeatures: string[];
  isUpdating: boolean;
  updateError: string | null;
}

// Reverse lookup: child key → parent group key
const CHILD_TO_GROUP: Record<string, string> = {};
for (const [groupKey, children] of Object.entries(FEATURE_GROUPS)) {
  for (const child of children) {
    CHILD_TO_GROUP[child] = groupKey;
  }
}

// Beta features configuration - single source of truth
const BETA_FEATURES_CONFIG: BetaFeatureConfig[] = [
  { key: 'sharepic', label: 'Sharepic', isAdminOnly: false, devOnly: true },
  { key: 'vorlagen', label: 'Vorlagen & Galerie', isAdminOnly: false, devOnly: true },
  { key: 'database', label: 'Datenbank', isAdminOnly: true },
  { key: 'notebook', label: 'Notebooks', isAdminOnly: false, defaultEnabled: true },
  {
    key: 'interactiveAntrag',
    label: 'Interaktiver Antrag',
    isAdminOnly: false,
    defaultEnabled: true,
  },
  { key: 'prompts', label: 'Eigene Prompts', isAdminOnly: false },
  { key: 'memories', label: 'Erinnerungen', isAdminOnly: false, defaultEnabled: true },
  // Profile-only settings (not shown in Labor tab)
  { key: 'labor', label: 'Labor', isAdminOnly: false, isProfileSetting: true },
];

// Dynamically generated arrays from config
const ADMIN_ONLY_FEATURES = BETA_FEATURES_CONFIG.filter((f) => f.isAdminOnly).map((f) => f.key);

// Unified hook for managing beta features using Zustand store
export const useBetaFeatures = (_options: UseBetaFeaturesOptions = {}): UseBetaFeaturesReturn => {
  const userId = useAuthStore((s) => s.user?.id);
  const isAdmin = useAuthStore((s) => s.user?.is_admin === true);

  // Split selectors to prevent unnecessary re-renders
  const betaFeatures = useBetaFeaturesStore((state: BetaFeaturesState) => state.betaFeatures);
  const isHydrated = useBetaFeaturesStore((state: BetaFeaturesState) => state.isHydrated);
  const isUpdating = useBetaFeaturesStore((state: BetaFeaturesState) => state.isUpdating);
  const error = useBetaFeaturesStore((state: BetaFeaturesState) => state.error);
  const toggle = useBetaFeaturesStore((state: BetaFeaturesState) => state.toggle);
  const storeUserId = useBetaFeaturesStore((state: BetaFeaturesState) => state.userId);
  const hydrate = useBetaFeaturesStore((state: BetaFeaturesState) => state.hydrate);

  // Ensure hydration when user changes - now includes hydrate in dependencies
  useEffect(() => {
    if (!userId) return;
    if (!isHydrated || storeUserId !== userId) {
      hydrate(userId);
    }
  }, [userId, isHydrated, storeUserId, hydrate]);

  // Helper functions - memoized with stable dependencies
  const getBetaFeatureState = React.useCallback(
    (key: string): boolean => {
      const isDev = import.meta.env.DEV;
      // If this key belongs to a group, resolve via the group parent
      const resolvedKey = CHILD_TO_GROUP[key] ?? key;
      const featureConfig = BETA_FEATURES_CONFIG.find((f) => f.key === resolvedKey);
      if (isDev && featureConfig?.devOnly) {
        return true;
      }
      if (betaFeatures?.[resolvedKey] !== undefined) {
        return !!betaFeatures[resolvedKey];
      }
      return featureConfig?.defaultEnabled ?? false;
    },
    [betaFeatures]
  );

  const canAccessBetaFeature = React.useCallback(
    (featureKey: string): boolean => {
      const resolvedKey = CHILD_TO_GROUP[featureKey] ?? featureKey;
      const isAdminOnlyFeature = ADMIN_ONLY_FEATURES.includes(resolvedKey);

      if (isAdminOnlyFeature && !isAdmin) {
        return false;
      }

      const isDev = import.meta.env.DEV;
      const featureConfig = BETA_FEATURES_CONFIG.find((f) => f.key === resolvedKey);
      if (isDev && featureConfig?.devOnly) {
        return true;
      }

      if (betaFeatures?.[resolvedKey] !== undefined) {
        return !!betaFeatures[resolvedKey];
      }
      return featureConfig?.defaultEnabled ?? false;
    },
    [betaFeatures, isAdmin]
  );

  const shouldShowTab = canAccessBetaFeature;

  const availableFeatures = React.useMemo((): BetaFeatureConfig[] => {
    const isDev = import.meta.env.DEV;
    return BETA_FEATURES_CONFIG.filter(
      (feature) =>
        (!feature.isAdminOnly || isAdmin) &&
        !feature.isProfileSetting &&
        (!feature.devOnly || isDev)
    );
  }, [isAdmin]);

  const getAvailableFeatures = React.useCallback(
    (): BetaFeatureConfig[] => availableFeatures,
    [availableFeatures]
  );

  const updateUserBetaFeatures = React.useCallback(
    (featureKey: string, isEnabled: boolean): Promise<void> => toggle(featureKey, isEnabled),
    [toggle]
  );

  return useMemo(
    () => ({
      betaFeatures,
      isLoading: !isHydrated,
      isError: !!error,
      error,
      getBetaFeatureState,
      canAccessBetaFeature,
      shouldShowTab,
      availableFeatures,
      getAvailableFeatures,
      updateUserBetaFeatures,
      isAdmin,
      adminOnlyFeatures: ADMIN_ONLY_FEATURES,
      isUpdating,
      updateError: error,
    }),
    [
      betaFeatures,
      isHydrated,
      error,
      getBetaFeatureState,
      canAccessBetaFeature,
      shouldShowTab,
      availableFeatures,
      getAvailableFeatures,
      updateUserBetaFeatures,
      isAdmin,
      isUpdating,
    ]
  );
};

export default useBetaFeatures;
