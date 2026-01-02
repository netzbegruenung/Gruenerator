/**
 * API Check Middleware for Zustand
 * Automatically validates feature access via backend API calls
 */

import apiClient from '../../components/utils/apiClient';

export const apiCheckMiddleware = (config: any) => (set: any, get: any, api: any) => {
  const storeApi = config(set, get, api);

  // Add API check functionality to the store
  const checkFeatureAccess = async (featureName: string) => {
    try {
      const response = await apiClient.post('/api/beta-features/access', { feature_name: featureName });
      const result = response.data;
      return result.canAccess || result.data;
    } catch (error: any) {
      console.warn(`API check failed for ${featureName}:`, error.message);
      return null;
    }
  };

  const validateAndUpdateFeatures = async () => {
    const state = get();
    const updates: Record<string, boolean> = {};
    let hasUpdates = false;

    // Check each feature that has API validation configured
    if (config.apiValidation) {
      for (const [featureKey, featureName] of Object.entries(config.apiValidation)) {
        const isCurrentlyEnabled = state[featureKey];

        if (isCurrentlyEnabled) {
          const canAccess = await checkFeatureAccess(featureName as string);

          if (canAccess === false) {
            console.log(`Auto-disabling ${featureKey} feature due to lack of access`);
            updates[featureKey] = false;
            hasUpdates = true;
          }
        }
      }
    }

    // Apply updates if any
    if (hasUpdates) {
      set(updates);
    }
  };

  // Expose validation function on the store
  return {
    ...storeApi,
    validateFeatureAccess: validateAndUpdateFeatures,
    checkSingleFeature: checkFeatureAccess
  };
};

/**
 * Configuration helper for API validation
 * Maps store keys to Supabase RPC feature names
 */
export const createApiValidationConfig = (featureMap: Record<string, string>) => ({
  apiValidation: featureMap
}); 