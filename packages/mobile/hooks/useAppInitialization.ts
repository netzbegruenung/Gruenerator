import { useEffect, useState } from 'react';
import { initializeApiClient } from '../services/api';
import { configureAuthStore, checkAuthStatus } from '../services/auth';
import { usePreferencesStore } from '../stores/preferencesStore';

export function useAppInitialization() {
  const [isInitialized, setIsInitialized] = useState(false);
  const loadPreferences = usePreferencesStore((state) => state.loadPreferences);

  useEffect(() => {
    async function initialize() {
      try {
        initializeApiClient();
        configureAuthStore();
        await Promise.all([
          checkAuthStatus(),
          loadPreferences(),
        ]);
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
