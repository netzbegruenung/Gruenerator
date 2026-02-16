import { useEffect, useState } from 'react';

import { initializeApiClient } from '../services/api';
import { configureAuthStore, checkAuthStatus } from '../services/auth';
import { registerForPushNotifications } from '../services/pushNotifications';
import { usePreferencesStore } from '../stores/preferencesStore';

export function useAppInitialization() {
  const [isInitialized, setIsInitialized] = useState(false);
  const loadPreferences = usePreferencesStore((state) => state.loadPreferences);

  useEffect(() => {
    async function initialize() {
      try {
        initializeApiClient();
        configureAuthStore();
        const [isAuthenticated] = await Promise.all([checkAuthStatus(), loadPreferences()]);

        // Register push token after successful auth (non-blocking)
        if (isAuthenticated) {
          registerForPushNotifications().catch((err) =>
            console.warn('[App] Push registration failed:', err)
          );
        }
      } catch (error) {
        console.error('[App] Initialization error:', error);
      } finally {
        setIsInitialized(true);
      }
    }

    initialize();
  }, [loadPreferences]);

  return { isInitialized };
}
