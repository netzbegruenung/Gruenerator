import React, { useEffect } from 'react';
import { useOptimizedAuth } from './useAuth';
import { useBetaFeaturesStore } from '../stores/betaFeaturesStore';

// Beta features configuration - single source of truth
const BETA_FEATURES_CONFIG = [
  { key: 'sharepic', label: 'Sharepic', isAdminOnly: false },
  // { key: 'you', label: 'You Generator', isAdminOnly: false },
  { key: 'groups', label: 'Gruppen', isAdminOnly: false, devOnly: true },
  { key: 'database', label: 'Datenbank', isAdminOnly: true },
  { key: 'customGenerators', label: 'Grüneratoren', isAdminOnly: false },
  { key: 'qa', label: 'Notebooks', isAdminOnly: false, devOnly: true },
  // { key: 'e_learning', label: 'E-Learning', isAdminOnly: false },
  // { key: 'bundestag_api_enabled', label: 'Bundestag API', isAdminOnly: false },
  // { key: 'memory', label: 'Memory (Mem0ry)', isAdminOnly: false },
  // { key: 'canva', label: 'Canva Integration', isAdminOnly: false },
  { key: 'chat', label: 'Grünerator Chat', isAdminOnly: false, devOnly: true },
  { key: 'sites', label: 'Web-Visitenkarte', isAdminOnly: false, devOnly: true },
  // Profile-only settings (not shown in Labor tab)
  { key: 'igel_modus', label: 'Igel-Modus', isAdminOnly: false, isProfileSetting: true },
  { key: 'labor', label: 'Labor', isAdminOnly: false, isProfileSetting: true },
];

// Dynamically generated arrays from config
const ADMIN_ONLY_FEATURES = BETA_FEATURES_CONFIG.filter(f => f.isAdminOnly).map(f => f.key);

// Unified hook for managing beta features using Zustand store
export const useBetaFeatures = (options = {}) => {
  const { user } = useOptimizedAuth();
  
  // Split selectors to prevent unnecessary re-renders
  const betaFeatures = useBetaFeaturesStore(state => state.betaFeatures);
  const isHydrated = useBetaFeaturesStore(state => state.isHydrated);
  const isUpdating = useBetaFeaturesStore(state => state.isUpdating);
  const error = useBetaFeaturesStore(state => state.error);
  const toggle = useBetaFeaturesStore(state => state.toggle);
  const storeUserId = useBetaFeaturesStore(state => state.userId);
  const hydrate = useBetaFeaturesStore(state => state.hydrate);

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
  const getBetaFeatureState = React.useCallback((key) => !!betaFeatures?.[key], [betaFeatures]);
  
  const canAccessBetaFeature = React.useCallback((featureKey) => {
    const isAdminOnlyFeature = ADMIN_ONLY_FEATURES.includes(featureKey);
    
    if (isAdminOnlyFeature && !isAdmin) {
      return false;
    }
    
    return !!betaFeatures?.[featureKey];
  }, [betaFeatures, isAdmin]);

  const shouldShowTab = React.useCallback((featureKey) => {
    const isAdminOnlyFeature = ADMIN_ONLY_FEATURES.includes(featureKey);
    
    if (isAdminOnlyFeature && !isAdmin) {
      return false;
    }
    
    return !!betaFeatures?.[featureKey];
  }, [betaFeatures, isAdmin]);

  const getAvailableFeatures = React.useCallback(() => {
    const isDev = import.meta.env.DEV;
    return BETA_FEATURES_CONFIG.filter(feature =>
      (!feature.isAdminOnly || isAdmin) &&
      !feature.isProfileSetting &&
      (!feature.devOnly || isDev)
    );
  }, [isAdmin]);

  const updateUserBetaFeatures = React.useCallback((featureKey, isEnabled) => toggle(featureKey, isEnabled), [toggle]);

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