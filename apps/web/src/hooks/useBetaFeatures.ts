import React, { useEffect } from 'react';

import { useBetaFeaturesStore } from '../stores/betaFeaturesStore';

import { useOptimizedAuth } from './useAuth';

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
  getAvailableFeatures: () => BetaFeatureConfig[];
  updateUserBetaFeatures: (featureKey: string, isEnabled: boolean) => Promise<void>;
  isAdmin: boolean;
  adminOnlyFeatures: string[];
  isUpdating: boolean;
  updateError: string | null;
}

// Beta features configuration - single source of truth
const BETA_FEATURES_CONFIG: BetaFeatureConfig[] = [
  { key: 'sharepic', label: 'Sharepic', isAdminOnly: false, devOnly: true },
  { key: 'groups', label: 'Gruppen', isAdminOnly: false, devOnly: true },
  { key: 'vorlagen', label: 'Vorlagen & Galerie', isAdminOnly: false, devOnly: true },
  { key: 'database', label: 'Datenbank', isAdminOnly: true },
  { key: 'notebook', label: 'Notebooks', isAdminOnly: false, defaultEnabled: true },
  { key: 'chat', label: 'Grünerator Chat', isAdminOnly: false },
  // { key: 'sites', label: 'Web-Visitenkarte', isAdminOnly: false, devOnly: true }, // Removed - outdated
  { key: 'website', label: 'Website Generator', isAdminOnly: false, devOnly: true },
  {
    key: 'interactiveAntrag',
    label: 'Interaktiver Antrag',
    isAdminOnly: false,
    defaultEnabled: true,
  },
  {
    key: 'autoSaveGenerated',
    label: 'Auto-Speichern generierter Texte',
    isAdminOnly: false,
    defaultEnabled: true,
  },
  { key: 'prompts', label: 'Eigene Prompts', isAdminOnly: false },
  { key: 'docs', label: 'Dokumente', isAdminOnly: false },
  { key: 'scanner', label: 'Scanner (OCR)', isAdminOnly: false },
  // Profile-only settings (not shown in Labor tab)
  { key: 'igel_modus', label: 'Igel-Modus', isAdminOnly: false, isProfileSetting: true },
  { key: 'labor', label: 'Labor', isAdminOnly: false, isProfileSetting: true },
];

// Dynamically generated arrays from config
const ADMIN_ONLY_FEATURES = BETA_FEATURES_CONFIG.filter((f) => f.isAdminOnly).map((f) => f.key);

// Unified hook for managing beta features using Zustand store
export const useBetaFeatures = (_options: UseBetaFeaturesOptions = {}): UseBetaFeaturesReturn => {
  const { user } = useOptimizedAuth();

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
    if (!user?.id) return;
    if (!isHydrated || storeUserId !== user.id) {
      hydrate(user.id);
    }
  }, [user?.id, isHydrated, storeUserId, hydrate]);

  // Memoize isAdmin to prevent unnecessary recalculations
  const isAdmin = React.useMemo(() => user?.is_admin === true, [user?.is_admin]);

  // Helper functions - memoized with stable dependencies
  const getBetaFeatureState = React.useCallback(
    (key: string): boolean => {
      const isDev = import.meta.env.DEV;
      const featureConfig = BETA_FEATURES_CONFIG.find((f) => f.key === key);
      if (isDev && featureConfig?.devOnly) {
        return true;
      }
      if (betaFeatures?.[key] !== undefined) {
        return !!betaFeatures[key];
      }
      return featureConfig?.defaultEnabled ?? false;
    },
    [betaFeatures]
  );

  const canAccessBetaFeature = React.useCallback(
    (featureKey: string): boolean => {
      const isAdminOnlyFeature = ADMIN_ONLY_FEATURES.includes(featureKey);

      if (isAdminOnlyFeature && !isAdmin) {
        return false;
      }

      const isDev = import.meta.env.DEV;
      const featureConfig = BETA_FEATURES_CONFIG.find((f) => f.key === featureKey);
      if (isDev && featureConfig?.devOnly) {
        return true;
      }

      if (betaFeatures?.[featureKey] !== undefined) {
        return !!betaFeatures[featureKey];
      }
      return featureConfig?.defaultEnabled ?? false;
    },
    [betaFeatures, isAdmin]
  );

  const shouldShowTab = React.useCallback(
    (featureKey: string): boolean => {
      const isAdminOnlyFeature = ADMIN_ONLY_FEATURES.includes(featureKey);

      if (isAdminOnlyFeature && !isAdmin) {
        return false;
      }

      const isDev = import.meta.env.DEV;
      const featureConfig = BETA_FEATURES_CONFIG.find((f) => f.key === featureKey);
      if (isDev && featureConfig?.devOnly) {
        return true;
      }

      if (betaFeatures?.[featureKey] !== undefined) {
        return !!betaFeatures[featureKey];
      }
      return featureConfig?.defaultEnabled ?? false;
    },
    [betaFeatures, isAdmin]
  );

  const getAvailableFeatures = React.useCallback((): BetaFeatureConfig[] => {
    const isDev = import.meta.env.DEV;
    const available = BETA_FEATURES_CONFIG.filter(
      (feature) =>
        (!feature.isAdminOnly || isAdmin) &&
        !feature.isProfileSetting &&
        (!feature.devOnly || isDev)
    );
    console.log(
      '[BetaFeatures] DEV:',
      isDev,
      'isAdmin:',
      isAdmin,
      'available:',
      available.map((f) => f.key)
    );
    return available;
  }, [isAdmin]);

  const updateUserBetaFeatures = React.useCallback(
    (featureKey: string, isEnabled: boolean): Promise<void> => toggle(featureKey, isEnabled),
    [toggle]
  );

  return {
    // Data
    betaFeatures,
    isLoading: !isHydrated,
    isError: !!error,
    error,

    // Helper functions
    getBetaFeatureState,
    canAccessBetaFeature,
    shouldShowTab,
    getAvailableFeatures,

    // Actions
    updateUserBetaFeatures,

    // Admin status
    isAdmin,
    adminOnlyFeatures: ADMIN_ONLY_FEATURES,

    // Mutation state
    isUpdating,
    updateError: error,
  };
};

export default useBetaFeatures;
