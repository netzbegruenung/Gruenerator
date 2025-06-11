/**
 * API Check Middleware for Zustand
 * Automatically validates feature access via Supabase RPC calls
 */

import { templatesSupabase } from '../../components/utils/templatesSupabaseClient';

export const apiCheckMiddleware = (config) => (set, get, api) => {
  const storeApi = config(set, get, api);

  // Add API check functionality to the store
  const checkFeatureAccess = async (featureName) => {
    try {
      const { data: canAccess, error } = await templatesSupabase
        .rpc('can_access_beta_feature', { feature_name: featureName });
      
      if (error) {
        console.warn(`Error checking ${featureName} access:`, error);
        return null; // Don't auto-disable on API errors
      }
      
      return canAccess;
    } catch (error) {
      console.warn(`API check failed for ${featureName}:`, error);
      return null;
    }
  };

  const validateAndUpdateFeatures = async () => {
    const state = get();
    const updates = {};
    let hasUpdates = false;

    // Check each feature that has API validation configured
    if (config.apiValidation) {
      for (const [featureKey, featureName] of Object.entries(config.apiValidation)) {
        const isCurrentlyEnabled = state[featureKey];
        
        if (isCurrentlyEnabled) {
          const canAccess = await checkFeatureAccess(featureName);
          
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
export const createApiValidationConfig = (featureMap) => ({
  apiValidation: featureMap
}); 