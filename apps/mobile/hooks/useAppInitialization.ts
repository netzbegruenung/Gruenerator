import { useAuthStore } from '@gruenerator/shared/stores';
import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { initializeApiClient } from '../services/api';
import { configureAuthStore, checkAuthStatus } from '../services/auth';
import { DEV_AUTH_BYPASS, DEV_BYPASS_USER } from '../services/devAuth';
import { usePreferencesStore } from '../stores/preferencesStore';

export function useAppInitialization() {
  const [isInitialized, setIsInitialized] = useState(false);
  const loadPreferences = usePreferencesStore((state) => state.loadPreferences);

  useEffect(() => {
    async function initialize() {
      try {
        initializeApiClient();
        configureAuthStore();

        // DEV bypass (Tier 1): seed a fake user so the app renders past the auth
        // gate in an emulator without Keycloak. Skip the server session probe —
        // there may be no backend, and a 401 would clear the seeded user.
        if (DEV_AUTH_BYPASS) {
          useAuthStore.getState().setAuthState({ user: DEV_BYPASS_USER });
          await loadPreferences();
          return;
        }

        await Promise.all([checkAuthStatus(), loadPreferences()]);
      } catch (error) {
        console.error('[App] Initialization error:', error);
      } finally {
        setIsInitialized(true);
      }
    }

    void initialize();
  }, [loadPreferences]);

  // Re-validate the session when the app returns to the foreground after a
  // spell in the background. Non-destructive: checkAuthStatus only logs out on
  // a definitive 401/403 or 2xx-no-user, so a transient failure here can never
  // bounce a valid session to login. Throttled so quick app switches (e.g. a
  // permission dialog) don't trigger a probe.
  useEffect(() => {
    if (DEV_AUTH_BYPASS) return;

    const REVALIDATE_AFTER_MS = 5 * 60 * 1000;
    let lastValidatedAt = Date.now();

    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active' && Date.now() - lastValidatedAt > REVALIDATE_AFTER_MS) {
        lastValidatedAt = Date.now();
        void checkAuthStatus();
      }
    });

    return () => subscription.remove();
  }, []);

  return { isInitialized };
}
