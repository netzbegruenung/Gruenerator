/**
 * API Check Middleware for Zustand
 * Automatically validates feature access via backend API calls
 */

import apiClient from '../../components/utils/apiClient';

export const apiCheckMiddleware =
  (config: (set: unknown, get: unknown, api: unknown) => Record<string, unknown>) =>
  (set: unknown, get: unknown, api: unknown) => {
    const storeApi = config(set, get, api);

    // Add API check functionality to the store
    const checkFeatureAccess = async (featureName: string) => {
      try {
        const response = await apiClient.post('/api/beta-features/access', {
          feature_name: featureName,
        });
        const result = response.data as Record<string, unknown>;
        return result.canAccess || result.data;
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`API check failed for ${featureName}:`, errorMessage);
        return null;
      }
    };

    const validateAndUpdateFeatures = async () => {
      const getState = get as () => Record<string, unknown>;
      const state = getState();
      const updates: Record<string, boolean> = {};
      let hasUpdates = false;

      // Check each feature that has API validation configured
      const configWithValidation = config as unknown as { apiValidation?: Record<string, string> };
      if (configWithValidation.apiValidation) {
        for (const [featureKey, featureName] of Object.entries(
          configWithValidation.apiValidation
        )) {
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
        (set as (updates: Record<string, boolean>) => void)(updates);
      }
    };

    // Expose validation function on the store
    return {
      ...storeApi,
      validateFeatureAccess: validateAndUpdateFeatures,
      checkSingleFeature: checkFeatureAccess,
    };
  };

/**
 * Configuration helper for API validation
 * Maps store keys to Supabase RPC feature names
 */
export const createApiValidationConfig = (featureMap: Record<string, string>) => ({
  apiValidation: featureMap,
});
