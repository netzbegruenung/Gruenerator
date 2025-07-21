import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOptimizedAuth } from './useAuth';

// Auth Backend URL aus Environment Variable oder Fallback zu aktuellem Host
const AUTH_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

// Beta features configuration - single source of truth
const BETA_FEATURES_CONFIG = [
  { key: 'sharepic', label: 'Sharepic', isAdminOnly: false },
  { key: 'you', label: 'You Generator', isAdminOnly: false },
  { key: 'collab', label: 'Kollaborative Bearbeitung', isAdminOnly: false },
  { key: 'groups', label: 'Gruppen', isAdminOnly: false },
  { key: 'database', label: 'Datenbank', isAdminOnly: true },
  { key: 'customGenerators', label: 'Grüneratoren', isAdminOnly: false },
  { key: 'qa', label: 'Q&A Sammlungen', isAdminOnly: false },
  { key: 'e_learning', label: 'E-Learning', isAdminOnly: false },
  // Profile settings treated as beta features for consistency
  { key: 'igel_modus', label: 'Igel-Modus', isAdminOnly: false, isProfileSetting: true },
  { key: 'bundestag_api_enabled', label: 'Bundestag API', isAdminOnly: false, isProfileSetting: true },
];

// Dynamically generated arrays from config
const ADMIN_ONLY_FEATURES = BETA_FEATURES_CONFIG.filter(f => f.isAdminOnly).map(f => f.key);

// Fetch beta features from backend API
const fetchBetaFeatures = async (user) => {
  // Fetching beta features
  
  // 1) Prefer user.beta_features (from profiles table/session) over user_metadata.beta_features
  if (user?.beta_features) {
    // Extract ALL individual profile settings from user object and merge with beta features
    const profileSettings = {
      igel_modus: user.igel_modus || false,
      bundestag_api_enabled: user.bundestag_api_enabled || false,
      groups: user.groups || false,
      customGenerators: user.custom_generators || false,
      database: user.database_access || false,
      you: user.you_generator || false,
      collab: user.collab || false,
      qa: user.qa || false,
      sharepic: user.sharepic || false,
      anweisungen: user.anweisungen || false
    };
    
    // Merge beta features with ALL individual profile settings for complete data
    const mergedFeatures = {
      ...user.beta_features,
      ...profileSettings
    };
    
    console.log('[useBetaFeatures] Merged beta features with ALL profile settings:', {
      userId: user.id,
      betaFeatures: user.beta_features,
      profileSettings,
      mergedFeatures
    });
    
    return mergedFeatures;
  }
  
  // 2) Fallback: Backend API Abfrage (ersetzt direkte Supabase calls)
  try {
    if (!user?.id) {
      // No user ID, returning empty features
      return {};
    }

    console.log('[useBetaFeatures] 🌐 Fetching from backend API...');
    const response = await fetch(`${AUTH_BASE_URL}/auth/profile/beta-features`, {
      method: 'GET',
      credentials: 'include',
      headers: { 
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      console.warn('[useBetaFeatures] ❌ Backend fetch error:', response.status);
      return {};
    }

    const result = await response.json();
    console.log('[useBetaFeatures] 📦 Backend API response:', result);
    
    const features = result.betaFeatures || {};
    console.log('[useBetaFeatures] ✅ Final features:', features);
    return features;
  } catch (err) {
    console.warn('[useBetaFeatures] ❌ Fetch error:', err);
    return {};
  }
};

// Update a single beta feature via backend API
const updateBetaFeature = async ({ key, value, userId }) => {
  const response = await fetch(`${AUTH_BASE_URL}/auth/profile/beta-features`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ feature: key, enabled: value })
  });
  
  const result = await response.json();
  
  if (!response.ok || !result.success) {
    throw new Error(result.message || 'Beta Feature Update fehlgeschlagen');
  }
  
  return result.betaFeatures;
};

// Unified hook for managing beta features
// Replaces both useBetaFeaturesWithSWR and useBetaFeatureManager
export const useBetaFeatures = (options = {}) => {
  const { enabled = true } = options;
  const { user } = useOptimizedAuth();
  const queryClient = useQueryClient();
  
  // Fetch beta features
  const {
    data: betaFeatures = {},
    isLoading,
    isError,
    error,
    refetch
  } = useQuery({
    queryKey: ['betaFeatures', user?.id],
    queryFn: () => fetchBetaFeatures(user),
    enabled: enabled && !!user?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 15 * 60 * 1000, // 15 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    retry: 1,
  });

  // Update beta feature mutation with optimistic updates
  const updateMutation = useMutation({
    mutationFn: ({ key, value }) => updateBetaFeature({ key, value, userId: user?.id }),
    
    // Optimistic update - instantly update cache before backend call
    onMutate: async ({ key, value }) => {
      console.log('[useBetaFeatures] ⚡ Optimistic update:', { key, value });
      
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['betaFeatures', user?.id] });
      
      // Snapshot previous value for rollback
      const previousFeatures = queryClient.getQueryData(['betaFeatures', user?.id]);
      
      // Optimistically update cache
      queryClient.setQueryData(['betaFeatures', user?.id], (oldData) => {
        const currentCache = oldData || {};
        return {
          ...currentCache,
          [key]: value
        };
      });
      
      // Return context for rollback
      return { previousFeatures };
    },
    
    onSuccess: (updatedFeatures, variables) => {
      console.log('[useBetaFeatures] ✅ Backend confirmed:', updatedFeatures);
      
      // Sync with backend response (in case server has different data)
      queryClient.setQueryData(['betaFeatures', user?.id], (oldData) => {
        const currentCache = oldData || {};
        return {
          ...currentCache,
          ...updatedFeatures
        };
      });
      
      // Also invalidate profile data since it contains beta features
      queryClient.invalidateQueries({ queryKey: ['profileData', user?.id] });
    },
    
    onError: (error, variables, context) => {
      console.error('[useBetaFeatures] ❌ Backend failed, rolling back:', error);
      
      // Rollback optimistic update
      if (context?.previousFeatures) {
        queryClient.setQueryData(['betaFeatures', user?.id], context.previousFeatures);
      }
    }
  });

  // Helper functions
  const getBetaFeatureState = (key) => !!betaFeatures?.[key];
  
  const isAdmin = user?.is_admin === true;
  
  const canAccessBetaFeature = (featureKey) => {
    const isAdminOnlyFeature = ADMIN_ONLY_FEATURES.includes(featureKey);
    
    if (isAdminOnlyFeature && !isAdmin) {
      return false;
    }
    
    return getBetaFeatureState(featureKey);
  };

  const shouldShowTab = (featureKey) => {
    const isAdminOnlyFeature = ADMIN_ONLY_FEATURES.includes(featureKey);
    
    if (isAdminOnlyFeature && !isAdmin) {
      return false;
    }
    
    return getBetaFeatureState(featureKey);
  };

  const getAvailableFeatures = () => {
    return BETA_FEATURES_CONFIG.filter(feature => !feature.isAdminOnly || isAdmin);
  };

  const updateUserBetaFeatures = (featureKey, isEnabled) => {
    return updateMutation.mutateAsync({ key: featureKey, value: isEnabled });
  };

  return {
    // Data
    betaFeatures,
    isLoading,
    isError,
    error,
    
    // Helper functions
    getBetaFeatureState,
    canAccessBetaFeature,
    shouldShowTab,
    getAvailableFeatures,
    
    // Actions
    updateUserBetaFeatures,
    refetch,
    
    // Admin status
    isAdmin,
    adminOnlyFeatures: ADMIN_ONLY_FEATURES,
    
    // Mutation state
    isUpdating: updateMutation.isPending,
    updateError: updateMutation.error,
  };
};

export default useBetaFeatures;